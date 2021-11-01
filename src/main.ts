import path from 'path';
import {
  Distribution,
  LambdaEdgeEventType,
  ViewerProtocolPolicy,
} from '@aws-cdk/aws-cloudfront';
import {
  HttpOrigin,
  S3Origin,
} from '@aws-cdk/aws-cloudfront-origins';
import {
  Policy, PolicyStatement,
} from '@aws-cdk/aws-iam';
import {
  Function,
  InlineCode,
  Runtime,
  Version,
} from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import {
  Bucket,
} from '@aws-cdk/aws-s3';
import {
  BucketDeployment,
  Source,
} from '@aws-cdk/aws-s3-deployment';
import {
  App,
  CfnOutput,
  Construct,
  CustomResource,
  Stack,
  StackProps,
} from '@aws-cdk/core';

process.env.LAMBDA_ASSETS_PATH = path.resolve(__dirname, '..', 'lambda-assets');
export class XFrameTestStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);
    // Create website
    const websiteEdgeFunction = new Function(this, 'WebsiteEdgeFunction', {
      runtime: Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: new InlineCode('\
      exports.handler = async(event) => {\n\
        const response = event.Records[0].cf.response;\n\
        const headers = response.headers;\n\
        headers[\'x-frame-options\'] = [{\n\
          key: \'X-Frame-Options\',\n\
          value: \'SAMEORIGIN\'\n\
        }];\n\
        console.log(response);\n\
        return response;\n\
      }'),
    });
    const websiteBucket = new Bucket(this, 'WebsiteBucket');
    new BucketDeployment(this, 'WebsiteDeployment', {
      destinationBucket: websiteBucket,
      sources: [
        Source.asset(
          path.resolve(__dirname, '..', 'website'),
        ),
      ],
    });
    const websiteDistribution = new Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: new S3Origin(websiteBucket, {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: new Version(this, 'WebsiteEdgeFunctionVersion', {
              lambda: websiteEdgeFunction,
            }),
          },
        ],
      },
      defaultRootObject: 'index.html',
      enableLogging: true,
    });
    new CfnOutput(this, 'Website-URL', {
      value: websiteDistribution.distributionDomainName,
    });
    // Create Proxy
    const proxyEdgeFunction = new Function(this, 'ProxyEdgeFunction', {
      runtime: Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: new InlineCode('\
        exports.handler = async(event) => {\n\
          const response = event.Records[0].cf.response;\n\
          const headers = response.headers;\n\
          console.log(JSON.stringify(response));\n\
          delete headers[\'x-frame-options\'];\n\
          console.log(JSON.stringify(response));\n\
          return response;\n\
        }\
      '),
    });
    const proxyDistribution = new Distribution(this, 'ProxyDistribution', {
      defaultBehavior: {
        origin: new HttpOrigin(websiteDistribution.domainName, {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: new Version(this, 'ProxyEdgeFunctionVersion', {
              lambda: proxyEdgeFunction,
            }),
          },
        ],
      },
      enableLogging: true,
    });
    new CfnOutput(this, 'Proxy-URL', {
      value: proxyDistribution.distributionDomainName,
    });
    // Create PWA
    const pwaBucket = new Bucket(this, 'PwaBucket');
    const pwaDepolymentFunction = new NodejsFunction(this, 'PwaDeploymentFunction', {
      entry: `${process.env.LAMBDA_ASSETS_PATH}/pwa-deployment/app.ts`,
    });
    pwaDepolymentFunction.role?.attachInlinePolicy(
      new Policy(this, 'PwaDeploymentPolicy', {
        policyName: 'PwaDeploymentPolicy',
        statements: [
          new PolicyStatement({
            actions: [
              's3:PutObject',
            ],
            resources: [
              `${pwaBucket.bucketArn}/*`,
            ],
          }),
        ],
      }),
    );
    new CustomResource(this, 'PwaDeployment', {
      serviceToken: pwaDepolymentFunction.functionArn,
      properties: {
        bucketName: pwaBucket.bucketName,
        proxyUrl: proxyDistribution.domainName,
        originUrl: websiteDistribution.domainName,
        update: Date.now(),
      },
    });
    const pwaDistribution = new Distribution(this, 'PwaDistribution', {
      defaultBehavior: {
        origin: new S3Origin(pwaBucket, {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      enableLogging: true,
    });
    new CfnOutput(this, 'PWA-URL', {
      value: pwaDistribution.distributionDomainName,
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1', //process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new XFrameTestStack(app, 'pwa-iframe-test', { env: devEnv });

app.synth();