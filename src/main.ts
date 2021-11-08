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
    // Create www.acer.com Lambda@Edge
    // Remove x-frame-options & redirect-origin headers on ORIGIN_RESPONSE
    const acerOriginResponseEdgeFunction = new Function(this, 'AcerOriginResponseEdgeFunction', {
      runtime: Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: new InlineCode('\
        exports.handler = async(event) => {\n\
          const response = event.Records[0].cf.response;\n\
          const headers = response.headers;\n\
          console.log(JSON.stringify(response));\n\
          delete headers[\'x-frame-options\'];\n\
          delete headers[\'redirect-origin\'];\n\
          console.log(JSON.stringify(response));\n\
          return response;\n\
        }\
      '),
    });
    // Create CloudFront distribution with "www.acer.com" become origin
    // and remove x-frame-options & redirect-origin headers
    const acerRemoveHeadersDistribution = new Distribution(this, 'AcerRemoveHeadersDistribution', {
      defaultBehavior: {
        origin: new HttpOrigin('www.acer.com', {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: new Version(this, 'AcerOriginResponseEdgeFunctionVersion', {
              lambda: acerOriginResponseEdgeFunction,
            }),
          },
        ],
      },
      enableLogging: true,
      comment: 'acer.com + remove headers',
    });
    // Create CloudFront distribution with "www.acer.com" become origin
    const acerOriginDistribution = new Distribution(this, 'AcerOriginDistribution', {
      defaultBehavior: {
        origin: new HttpOrigin('www.acer.com', {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      enableLogging: true,
      comment: 'acer.com origin',
    });
    // Display CloudFront URL, origin is "www.acer.com"
    new CfnOutput(this, 'Acer-Origin-CloudFront-URL', {
      value: acerOriginDistribution.distributionDomainName,
    });
    // Display CloudFront URL, origin is "www.acer.com", but remove x-frame-options & redirect-origin headers
    new CfnOutput(this, 'Acer-Remove-Headers-CloudFront-URL', {
      value: acerRemoveHeadersDistribution.distributionDomainName,
    });
    // Create website bucket and upload html source code
    const websiteBucket = new Bucket(this, 'WebsiteBucket');
    new BucketDeployment(this, 'WebsiteDeployment', {
      destinationBucket: websiteBucket,
      sources: [
        Source.asset(
          path.resolve(__dirname, '..', 'website'),
        ),
      ],
    });
    // Create Website Lambda@Edge
    // Add x-frame-options into headers
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
    // Create Website CloudFront and through Lambda@Edge to add x-frame-options into headers
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
      comment: 'Website - Add x-frame-options header',
    });
    // Display CloudFront Website URL
    new CfnOutput(this, 'Website-URL', {
      value: websiteDistribution.distributionDomainName,
    });
    // Create PWA bucket
    const pwaBucket = new Bucket(this, 'PwaBucket');
    // Create PWA CloudFront
    const pwaDistribution = new Distribution(this, 'PwaDistribution', {
      defaultBehavior: {
        origin: new S3Origin(pwaBucket, {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      enableLogging: true,
      comment: 'PWA PoC website',
    });
    // Display CloudFront PWA Demo URL
    new CfnOutput(this, 'PWA-URL', {
      value: pwaDistribution.distributionDomainName,
    });
    // Create Proxy CloudFront "Viewer-Request" Lambda@Edge to check referer in white list
    const proxyViewerRequestEdgeFunction = new Function(this, 'ProxyViewerRequestEdgeFunction', {
      runtime: Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: new InlineCode('\
        exports.handler = async(event, context, callback) => {\n\
          const request = event.Records[0].cf.request;\n\
          const headers = request.headers;\n\
          console.log(JSON.stringify(event));\n\
          //if (headers.referer[0].value === \'https://xxx.cloudfront.net/\') {\n\
          //  callback(null, request)\n\
          //} else {\n\
          //  callback(\'error\', request)\n\
          //}\n\
          callback(null, request)\n\
        }\
      '),
    });
    // Create Proxy CloudFront "Origin-Response" Lambda@Edge to remove x-frame-options header
    const proxyOriginResponseEdgeFunction = new Function(this, 'ProxyOriginResponseEdgeFunction', {
      runtime: Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: new InlineCode('\
        exports.handler = async(event) => {\n\
          const response = event.Records[0].cf.response;\n\
          const headers = response.headers;\n\
          console.log(JSON.stringify(response));\n\
          response.headers[\'content-security-policy\'] = [\n\
            {\n\
              key: \'Content-Security-Policy\',\n\
              value: \'frame-ancestors d5huhy1vb0h95.cloudfront.net\'\n\
            }\n\
          ];\n\
          // delete headers[\'x-frame-options\'];\n\
          console.log(JSON.stringify(response));\n\
          return response;\n\
        }\
      '),
    });
    // Create Proxy CloudFront and through Lambda@Edge to remove x-frame-options header
    const proxyDistribution = new Distribution(this, 'ProxyDistribution', {
      defaultBehavior: {
        origin: new HttpOrigin(websiteDistribution.domainName, {
          originPath: '/',
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.VIEWER_REQUEST,
            functionVersion: new Version(this, 'ProxyViewerRequestEdgeFunctionVersion', {
              lambda: proxyViewerRequestEdgeFunction,
            }),
          },
          {
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
            functionVersion: new Version(this, 'ProxyOriginResponseEdgeFunctionVersion', {
              lambda: proxyOriginResponseEdgeFunction,
            }),
          },
        ],
      },
      enableLogging: true,
      comment: 'Origin from website + add "Content-Security-Policy" header',
    });
    // Display CloudFront Proxy URL
    new CfnOutput(this, 'Proxy-URL', {
      value: proxyDistribution.distributionDomainName,
    });
    // Create PWA deployment function to dynamic generate PWA contents
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
        acerOriginUrl: acerOriginDistribution.distributionDomainName,
        acerRemoveHeadersUrl: acerRemoveHeadersDistribution.distributionDomainName,
        update: Date.now(),
      },
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1', //process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new XFrameTestStack(app, 'pwa-iframe-t2', { env: devEnv });

app.synth();