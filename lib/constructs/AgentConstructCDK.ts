import {
  aws_bedrock,
  aws_iam as iam,

} from "aws-cdk-lib";


import * as constructs from 'constructs';
export class AgentConstructCDK extends constructs.Construct {
  genAI_agent: aws_bedrock.CfnAgent;
  constructor(
    scope: constructs.Construct,
    id: string,
    props: {
      stage: string;
      applicationName: string;
      piiGuardrail: aws_bedrock.CfnGuardrail;
      piiGuardrailVersion: aws_bedrock.CfnGuardrailVersion;
      bedrockKnowledgeBase: aws_bedrock.CfnKnowledgeBase;
    }
  ) {
    super(scope, id);
    const bedrockAgentRole = new iam.Role(this, "BedrockAgentRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("bedrock.amazonaws.com"),
        new iam.ServicePrincipal("lambda.amazonaws.com")
      ),
      description: "This role will be assumed by AWS bedrock agent.",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });    
    this.genAI_agent = new aws_bedrock.CfnAgent(this, "GenAIBedrockAgent", {
      agentName: `${props.stage}-genAI-bedrock-agent`,
      agentResourceRoleArn: bedrockAgentRole.roleArn,
      instruction:
        "Your name is genAIApp, an AI assistant. Your role is to provide accurate technical guidance.",
      description: `An intelligent assistant in ${props.stage}.`,
      autoPrepare: true,
      idleSessionTtlInSeconds: 3600,
      //memory configuration need to be added
      foundationModel: "amazon.nova-lite-v1:0",
      guardrailConfiguration: {
        guardrailIdentifier: props.piiGuardrail.attrGuardrailId,
        guardrailVersion: props.piiGuardrailVersion.attrVersion,
      },
      promptOverrideConfiguration: {
        promptConfigurations: [
          {
            basePromptTemplate: `{
              "schemaVersion": "bedrock-conversation-2024",
              "system": [
                {
                  "text": "
Agent Instruction: $instruction$
IMPORTANT: Always follow these rules. 
Rule 1: Always follow the rules and guidelines.

Guidelines:
$multi_agent_collaboration$
$code_interpreter_guideline$
$knowledge_base_additional_guideline$
$memory_guideline$
$memory_content$
$memory_action_guideline$
$code_interpreter_files$
$prompt_session_attributes$
                  "
                }
              ],
              "messages": [
                {
                  "role": "user",
                  "content": [
                    {
                      "text": "$question$"
                    }
                  ]
                },
                {
                  "role": "assistant",
                  "content": [
                    {
                      "text": "$agent_scratchpad$"
                    }
                  ]
                },
                {
                  "role" : "assistant",
                  "content" : [
                    {
                      "text": "Thought: <thinking>\n(1)"
                    }
                  ]
                }
              ]
            }`,
            inferenceConfiguration: {
              maximumLength: 2048,
              temperature: 0.0,
              topP: 0.5,
            },
            promptCreationMode: "OVERRIDDEN",
            promptState: "ENABLED",
            promptType: "ORCHESTRATION",
          },
        ],
      },
      knowledgeBases: [
        {
          description:
            "Sample KB Description",
          knowledgeBaseId: props.bedrockKnowledgeBase.attrKnowledgeBaseId,
        },
      ],
    });
    this.genAI_agent.node.addDependency(bedrockAgentRole);
    const bedrockAgentAlias = new aws_bedrock.CfnAgentAlias(
      this,
      "genAI_nova_lite_v2",
      {
        agentAliasName: "genAI_nova_lite_alias_v2",
        agentId: this.genAI_agent.attrAgentId,
        description:
          "TEMP 0, TOP P 0.5, MAX 2048, NO ASKUSER AG + Your name is AWS genAI, an knowledgeable + DEFAULT PROMPTS",
      }
    );
    bedrockAgentAlias.node.addDependency(this.genAI_agent);
  }
}
