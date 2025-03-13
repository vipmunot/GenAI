import {
  aws_bedrock,

} from "aws-cdk-lib";


import * as constructs from 'constructs';
export class GuardRailsConstructCDK extends constructs.Construct {
  piiGuardrail: aws_bedrock.CfnGuardrail;
  piiGuardrailVersion: aws_bedrock.CfnGuardrailVersion;
  constructor(
    scope: constructs.Construct,
    id: string,
    props: {
      stage: string;
      applicationName: string;

    },
  ) {
    super(scope, id);
    this.piiGuardrail = new aws_bedrock.CfnGuardrail(
      this,
      "no_harmful_prompt_attack_pii",
      {
        blockedInputMessaging:
          "Sorry, GenAIApp cannot answer this question as it violates our policies. Is there anything else I can help you with?",
        blockedOutputsMessaging:
          "Sorry, GenAIApp cannot answer this question. Is there anything else I can help you with?",
        name: "no_harmful_prompt_attack_pii",
        // the properties below are optional
        contentPolicyConfig: {
          filtersConfig: [
            {
              inputStrength: "MEDIUM",
              outputStrength: "MEDIUM",
              type: "SEXUAL",
            },
            {
              inputStrength: "MEDIUM",
              outputStrength: "MEDIUM",
              type: "VIOLENCE",
            },
            {
              inputStrength: "LOW",
              outputStrength: "LOW",
              type: "HATE",
            },
            {
              inputStrength: "LOW",
              outputStrength: "LOW",
              type: "INSULTS",
            },
            {
              inputStrength: "MEDIUM",
              outputStrength: "MEDIUM",
              type: "MISCONDUCT",
            },
            {
              inputStrength: "HIGH",
              outputStrength: "NONE",
              type: "PROMPT_ATTACK",
            },
          ],
        },
        contextualGroundingPolicyConfig: {
          filtersConfig: [
            {
              threshold: 0.3,
              type: "GROUNDING",
            },
          ],
        },
        description:
          "No harmful intent, pprompt attack, grounded factual, pii answers and prompts.",
        sensitiveInformationPolicyConfig: {
          piiEntitiesConfig: [
            {
              action: "BLOCK",
              type: "USERNAME",
            },
            {
              action: "BLOCK",
              type: "PASSWORD",
            },
          ],
        },
      }
    );
    this.piiGuardrailVersion = new aws_bedrock.CfnGuardrailVersion(
      this,
      "no_harmful_prompt_attack_pii_v1",
      {
        guardrailIdentifier: this.piiGuardrail.attrGuardrailId,

        // the properties below are optional
        description: "Version 1",
      }
    );

  }
}
