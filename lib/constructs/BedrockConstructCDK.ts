import {
  aws_iam,
  aws_lambda,
  aws_opensearchserverless,
  Duration,
  aws_kms,
  aws_logs,
  custom_resources,
  CustomResource,
  aws_bedrock,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import * as path from 'path';


import * as constructs from 'constructs';
export class BedrockConstructCDK extends constructs.Construct {
  bedrockKnowledgeBase: aws_bedrock.CfnKnowledgeBase;
  constructor(
    scope: constructs.Construct,
    id: string,
    props: {
      stage: string;
      applicationName: string;
      genAIBucket: string;
      folderName: string;
      genAIKMSKey: string;
    },
  ) {
    super(scope, id);

    const createIndexLambdaExecutionRole = new aws_iam.Role(this, 'CreateIndexLambdaExecutionRole', {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Managed by CDK. ${props.applicationName}`,
      managedPolicies: [aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });

    const OpenSearchCollection = new aws_opensearchserverless.CfnCollection(this, 'OpenSearchCollection', {
      name: `${props.applicationName}-${props.stage}-collection`.toLowerCase().substring(0, 30),
      type: 'VECTORSEARCH',
      description: `Managed by CDK. ${props.applicationName}`,
    });
    const key = new aws_kms.Key(this, 'OpenSearchEncryptionKey', {
      enableKeyRotation: true,
      alias: `${props.applicationName}-${props.stage}-opensearch-serverless`,
    });
    const OpenSearchCollectionSecurityPolicy = new aws_opensearchserverless.CfnSecurityPolicy(
      this,
      'OpenSearchCollectionSecurityPolicy',
      {
        description: `Managed by CDK. ${props.applicationName}`,
        name: `${props.applicationName}-${props.stage}-security-policy`.toLowerCase().substring(0, 30),
        type: 'encryption',
        policy: JSON.stringify({
          Rules: [
            {
              Resource: [`collection/${OpenSearchCollection.name}`],
              ResourceType: 'collection',
            },
          ],
          KmsARN: `${key.keyArn}`,
        }),
      },
    );

    const OpenSearchNetworkPolicy = new aws_opensearchserverless.CfnSecurityPolicy(this, 'OpenSearchNetworkPolicy', {
      description: `Managed by CDK. ${props.applicationName}`,
      name: `${props.applicationName}-${props.stage}-network-policy`.toLowerCase().substring(0, 30),
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${OpenSearchCollection.name}`],
              ResourceType: 'dashboard',
            },
            {
              Resource: [`collection/${OpenSearchCollection.name}`],
              ResourceType: 'collection',
            },
          ],
          AllowFromPublic: true,
        },
      ]),
    });
    const OpenSearchAccessPolicy = new aws_opensearchserverless.CfnAccessPolicy(this, 'dataAccessPolicy', {
      name: `${OpenSearchCollection.name}-dap`.toLowerCase().substring(0, 30),
      description: `Data access policy for: ${OpenSearchCollection.name}`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${OpenSearchCollection.name}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems',
              ],
              ResourceType: 'collection',
            },
            {
              Resource: [`index/${OpenSearchCollection.name}/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument',
              ],
              ResourceType: 'index',
            },
          ],
          Principal: [`arn:aws:iam::${Stack.of(this).account}:root`, createIndexLambdaExecutionRole.roleArn],
          Description: 'data-access-rule',
        },
      ]),
    });

    OpenSearchCollection.addDependency(OpenSearchCollectionSecurityPolicy);
    OpenSearchCollection.addDependency(OpenSearchNetworkPolicy);
    OpenSearchCollection.addDependency(OpenSearchAccessPolicy);
    const VECTOR_INDEX_NAME = 'bedrock-knowledgebase-index';
    const VECTOR_FIELD_NAME = 'bedrock-knowledge-base-default-vector';

    const lambdaLayerVersion = new aws_lambda.LayerVersion(this, 'MainLambdaOrchestratorLayer', {
      compatibleRuntimes: [aws_lambda.Runtime.PYTHON_3_12],
      description: `Managed by CDK. ${props.applicationName}`,
      code: aws_lambda.Code.fromAsset(path.join(__dirname, `../../assets/lambda_layers/main_layer.zip`)),
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const CreateIndexFnLogs = new aws_logs.LogGroup(this, 'CreateIndexFnLogs', {
      logGroupName: `/aws/lambda/${props.applicationName}/CreateIndexFunction`.slice(0, 512),
      retention: aws_logs.RetentionDays.TEN_YEARS,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      logGroupClass: aws_logs.LogGroupClass.STANDARD,
    });
    console.log(path);
    /* Create the lambda function */
    const CreateIndexFunction = new aws_lambda.Function(this, 'CreateIndexFunction', {
      runtime: aws_lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: aws_lambda.Code.fromAsset(path.join(__dirname, `../../assets/lambdas/create_index`)),
      description: `Managed by CDK. ${props.applicationName}`,
      memorySize: 1024,
      role: createIndexLambdaExecutionRole,
      timeout: Duration.seconds(900),
      layers: [lambdaLayerVersion],
      logGroup: CreateIndexFnLogs,
      environment: {
        REGION_NAME: Stack.of(this).region,
        COLLECTION_HOST: OpenSearchCollection.attrCollectionEndpoint,
        VECTOR_INDEX_NAME: VECTOR_INDEX_NAME,
        VECTOR_FIELD_NAME: VECTOR_FIELD_NAME,
      },
      tracing: aws_lambda.Tracing.ACTIVE,
      retryAttempts: 0,
    });
    createIndexLambdaExecutionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ['aoss:APIAccessAll'],
        effect: aws_iam.Effect.ALLOW,
        resources: [
          `arn:aws:aoss:${Stack.of(this).region}:${Stack.of(this).account}:collection/${OpenSearchCollection.attrId}`,
        ],
      }),
    );
    const lambdaProvider = new custom_resources.Provider(this, 'LambdaCreateIndexCustomProvider', {
      onEventHandler: CreateIndexFunction,
    });
    const lambdaCR = new CustomResource(this, 'LambdaCreateIndexCustomResource', {
      serviceToken: lambdaProvider.serviceToken,
    });
    const KBName = `${props.applicationName}_BedrockKnowledgeBase`;
    const textField = 'AMAZON_BEDROCK_TEXT_CHUNK';
    const metadataField = 'AMAZON_BEDROCK_METADATA';

    const embeddingModelArn = `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`;
    const modelPolicy = new aws_iam.ManagedPolicy(
      this,
      `AmazonBedrockFoundationModelPolicyForKnowledgeBase_${KBName}`,
      {
        description: `Managed by CDK. ${props.applicationName}`,
        statements: [
          new aws_iam.PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: [embeddingModelArn, `${embeddingModelArn}*`],
          }),
        ],
      },
    );

    const aossPolicy = new aws_iam.ManagedPolicy(this, `AmazonBedrockOSSPolicyForKnowledgeBase_${KBName}`, {
      description: `Managed by CDK. ${props.applicationName}`,
      statements: [
        new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ['aoss:APIAccessAll'],
          resources: [
            `arn:aws:aoss:${Stack.of(this).region}:${Stack.of(this).account}:collection/${OpenSearchCollection.attrId}`,
          ],
        }),
      ],
    });

    const s3Policy = new aws_iam.ManagedPolicy(this, `AmazonBedrockFoundationS3PolicyForKnowledgeBase_${KBName}`, {
      description: `Managed by CDK. ${props.applicationName}`,
      statements: [
        new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [`arn:aws:s3:::${props.genAIBucket}`],
        }),
        new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [`arn:aws:s3:::${props.genAIBucket}/${props.folderName}/bedrock/*`],
        }),
      ],
    });
    const kbKMSPolicy = new aws_iam.ManagedPolicy(this, `AmazonBedrockKnowledgeBaseKMSPolicy_${KBName}`, {
      description: `Managed by CDK. ${props.applicationName}`,
      statements: [
        new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [`${key.keyArn}`, `${props.genAIKMSKey}`],
        }),
      ],
    });
    const kbRole = new aws_iam.Role(this, `KnowledgeBaseRole`, {
      description: `Managed by CDK. ${props.applicationName}`,
      assumedBy: new aws_iam.ServicePrincipal('bedrock.amazonaws.com'),
      managedPolicies: [modelPolicy, aossPolicy, s3Policy, kbKMSPolicy],
    });
    this.bedrockKnowledgeBase = new aws_bedrock.CfnKnowledgeBase(this, 'BedrockKnowledgeBase', {
      name: KBName,
      roleArn: kbRole.roleArn,
      description: `Managed by CDK. ${props.applicationName}`,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: embeddingModelArn,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: OpenSearchCollection.attrArn,
          vectorIndexName: VECTOR_INDEX_NAME,
          fieldMapping: {
            vectorField: VECTOR_FIELD_NAME,
            metadataField: metadataField,
            textField: textField,
          },
        },
      },
    });
    this.bedrockKnowledgeBase.addDependency(OpenSearchCollection);
    this.bedrockKnowledgeBase.node.addDependency(lambdaCR);
    const s3DataSource = new aws_bedrock.CfnDataSource(this, 'MyCfnDataSource', {
      dataSourceConfiguration: {
        s3Configuration: {
          bucketArn: `arn:aws:s3:::${props.genAIBucket}`,
          inclusionPrefixes: [`${props.folderName}/bedrock/`],
        },
        type: 'S3',
      },
      knowledgeBaseId: this.bedrockKnowledgeBase.attrKnowledgeBaseId,
      name: `${props.applicationName}_s3_source`,
      dataDeletionPolicy: 'RETAIN',
      serverSideEncryptionConfiguration: {
        kmsKeyArn: `${props.genAIKMSKey}`,
      },
    });
    s3DataSource.addDependency(this.bedrockKnowledgeBase);
  }
}
