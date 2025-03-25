import { RemovalPolicy, Stack, CfnOutput, StackProps } from "aws-cdk-lib";
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BedrockConstructCDK } from './constructs/BedrockConstructCDK';
import { GuardRailsConstructCDK } from "./constructs/GuardRailsConstructCDK";
import { AgentConstructCDK } from "./constructs/AgentConstructCDK";
import { SagemakerConstructCDK } from "./constructs/SagemakerConstructCDK";
export class GenAiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    new SagemakerConstructCDK(this, "SagemakerConstructCDK", {
      stage: "STANDALONE",
      applicationName: "GenAIApps"
    });
    // The code that defines your stack goes here
    const s3Key = new kms.Key(this, `s3_kms_key`, {
      enableKeyRotation: true,
      description: 'Managed by CDK',
      policy: iam.PolicyDocument.fromJson({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${Stack.of(this).account}:root`,
              Service: ['lambda.amazonaws.com', 'bedrock.amazonaws.com', 's3.amazonaws.com'],
            },
            Action: 'kms:*',
            Resource: '*',
          },
        ],
      }),
    });
    const genAIBucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: s3Key,
      bucketKeyEnabled: true,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // ************************************
    // BEDROCK CONSTRUCT
    // ************************************
    const bedrockApps = new BedrockConstructCDK(this, "BedrockConstructCDK", {
      stage: "STANDALONE",
      applicationName: "GenAIApps",
      genAIBucket: genAIBucket.bucketName,
      genAIKMSKey: s3Key.keyArn,
      folderName: "full_curated_layer",
    });
    const guardrailApps = new GuardRailsConstructCDK(this, "GuardRailsConstructCDK", {
      stage: "STANDALONE",
      applicationName: "GenAIApps",
    });
    const agentApps = new AgentConstructCDK(this, "AgentConstructCDK", {
      stage: "STANDALONE",
      applicationName: "GenAIApps",
      piiGuardrail: guardrailApps.piiGuardrail,
      piiGuardrailVersion: guardrailApps.piiGuardrailVersion,
      bedrockKnowledgeBase: bedrockApps.bedrockKnowledgeBase,
    });
    // Output
    new CfnOutput(this, "GenAIAppsKB", {
      description: "GenAIAppsKB",
      exportName: "GenAIAppsKB",
      value: bedrockApps.bedrockKnowledgeBase.attrKnowledgeBaseId,
    });
    new CfnOutput(this, "GenAIAppsAgent", {
      description: "GenAIAppsAgent",
      exportName: "GenAIAppsAgent",
      value: agentApps.genAI_agent.attrAgentId,
    });
  }
}
