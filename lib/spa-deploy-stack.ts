import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3'
import * as s3Deploy from '@aws-cdk/aws-s3-deployment'
import * as cloudfront from '@aws-cdk/aws-cloudfront'
import * as route53 from '@aws-cdk/aws-route53';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as alias from '@aws-cdk/aws-route53-targets';

/**
 * Config for website creation
 */
interface Config {
  region: string; // Default AWS Region to deploy resources to
  resourcePrefix: string; // Prefix to resources i.e. 'WebsiteName' to be used as 'WebsiteNameBucket'
  domainName: string; // AWS hosted domain name
  certArn: string; // Certificate ARN for the AWS hosted domain
  siteDir: string; // Local relative location of compiled website files to be uploaded to S3
  hostedZoneExists?: boolean; // If a hosted zone already exists for this domain
}

/**
 * Use AWS CDK to create a stack resources for hosting a Static SPA website
 */
export const createSpaDeployStack = (app: cdk.Construct, config: Config) => {
  const {
    region,
    resourcePrefix,
    domainName,
    certArn,
    siteDir,
    hostedZoneExists
  } = config;

  // Define cloudformation stack instance to create our resources within
  const stack = new cdk.Stack(app, `${resourcePrefix}Stack`, {
    env: {
      region
    }
  })

  // Create an S3 Bucket to store website content
  const bucket = new s3.Bucket(stack, `${resourcePrefix}Bucket`, {
    publicReadAccess: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    websiteIndexDocument: "index.html",
    websiteErrorDocument: "index.html",
    autoDeleteObjects: true // Ensures the bucket can be deleted in a rollback
  });

  // Upload website content to S3 Bucket
  new s3Deploy.BucketDeployment(stack, `${resourcePrefix}UploadWebsite`, {
    sources: [s3Deploy.Source.asset(siteDir)],
    destinationBucket: bucket
  });

  // Select the existing SSL certificate for the given domain
  // The CDK supports creating DNS validated Certificates, however the validation process
  // can take up to half an hour, so is unreliable for this process
  // (this line can be removed since we already know the cert arn)
  const certificate = acm.Certificate.fromCertificateArn(stack, `${resourcePrefix}NetCert`, certArn);

  // Cloudfront
  const cf = new cloudfront.CloudFrontWebDistribution(stack, `${resourcePrefix}CDN`, {
    viewerCertificate: {
      props: {
        sslSupportMethod: 'sni-only',
        acmCertificateArn: certificate.certificateArn
      },
      aliases: [
        domainName
      ]
    },
    originConfigs: [
      {
        s3OriginSource: {
          s3BucketSource: bucket
        },
        behaviors: [{isDefaultBehavior: true}]
      },
    ],
    // We are deploying a SPA, hence we need to return the index.html for 404 / 403s in S3
    errorConfigurations: [403, 404].map(code => (
      {
        errorCode: code,
        responsePagePath: '/index.html',
        responseCode: 200
      }
    ))
  });


  // Setup the Public Zone DNS using route53
  const zone = hostedZoneExists
    ? route53.HostedZone.fromLookup(stack, `${resourcePrefix}HostedZone`, {
      domainName
    })
    : new route53.PublicHostedZone(stack, `${resourcePrefix}HostedZone`, {
      zoneName: domainName,
    });

  // Create A record within zone pointing forwarding requests to CloudFront
  new route53.ARecord(stack, `${resourcePrefix}ARecord`, {
    zone,
    target: route53.RecordTarget.fromAlias(new alias.CloudFrontTarget(cf))
  });
}
