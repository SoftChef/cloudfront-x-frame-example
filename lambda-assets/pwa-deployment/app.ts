import {
  CustomResource,
} from '@softchef/lambda-events';
import { S3 } from 'aws-sdk';

export async function handler(event: Object): Promise<any> {
  const request = new CustomResource.Request(event);
  const response = new CustomResource.Response(event);
  try {
    const s3 = new S3();
    const bucketName = request.property('bucketName');
    const originUrl = request.property('originUrl');
    const proxyUrl = request.property('proxyUrl');
    const acerOriginUrl = request.property('acerOriginUrl');
    const acerAddHeadersUrl = request.property('acerAddHeadersUrl');
    await s3.putObject({
      Bucket: bucketName,
      Key: 'index.html',
      ContentType: 'text/html',
      Body: `<html>
  <body>
    <h3>This is PWA website</h3>
    <h4>Iframe from Proxy URL https://${proxyUrl}</h4>
    <p>The proxy URL is removed x-frame-options header by CloudFront & Lambda@Edge, it's embed content success.</p>
    <iframe src="https://${proxyUrl}" width="100%" height="250"></iframe>
    <p>The origin URL is added x-frame-options header, it's embed content failed.</p>
    <h4>Iframe from Origin URL https://${originUrl}</h4>
    <iframe src="https://${originUrl}" width="100%" height="250"></iframe>
    <h4>Iframe from Acer Origin CloudFront URL https://${acerOriginUrl}</h4>
    <iframe src="https://${acerOriginUrl}" width="100%" height="250"></iframe>
    <h4>Iframe from Acer Add Headers URL https://${acerAddHeadersUrl}</h4>
    <iframe src="https://${acerAddHeadersUrl}" width="100%" height="250"></iframe>
  </body>
</html>`,
    }).promise();
    await response.success({});
  } catch (error) {
    await response.failed(error);
  }
}