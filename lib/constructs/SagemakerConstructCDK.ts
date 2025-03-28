import {
  aws_sagemaker as sagemaker,
  aws_iam as iam,
  aws_scheduler as scheduler,
  Stack

} from "aws-cdk-lib";
import * as path from 'path';
import * as fs from 'fs';
import * as constructs from 'constructs';
export class SagemakerConstructCDK extends constructs.Construct {

  constructor(
    scope: constructs.Construct,
    id: string,
    props: {
      stage: string;
      applicationName: string;

    },
  ) {
    super(scope, id);
    const sagemakerRole = new iam.Role(this, 'role', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com')
    });

    let pipelineJSON = fs.readFileSync(path.join(__dirname, `../../assets/sagemaker/pipeline.json`), 'utf-8'); 
    pipelineJSON = pipelineJSON.replace(/\\/g, "");
    // Replace the hardcoded role ARN with the new role ARN
    pipelineJSON = pipelineJSON.replace(
      'arn:aws:iam::123456789102:role/VoC-ModelsAlphaStage-VoC--SagemakerExecutionRole4EB-zqTMV6PAYRmN',
      sagemakerRole.roleArn
    );
    pipelineJSON = pipelineJSON.replace(
      'arn:aws:iam::123456789102:role/VoC-ModelsAlphaStage-VoC--SagemakerExecutionRole4EB-zqTMV6PAYRmN',
      sagemakerRole.roleArn
    );    
    const pipeline1 = new sagemaker.CfnPipeline(this, 'pipeline', {
      roleArn: sagemakerRole.roleArn,
      pipelineName: `pipeline-${props.stage}`,
      pipelineDisplayName: `pipeline-${props.stage}`,
      pipelineDefinition: {
        PipelineDefinitionBody: pipelineJSON,
      }
    });
    const sagemakerScheduleRole = new iam.Role(this, 'scheduleRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com')
    });
    sagemakerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sagemaker:StartPipelineExecution'],
      resources: [`arn:aws:sagemaker:${Stack.of(this).region}:${Stack.of(this).account}:pipeline/${pipeline1.pipelineName}`],
    }));
    new scheduler.CfnSchedule(this, 'schedule', {
      flexibleTimeWindow: {
        mode: 'OFF',
      },
      scheduleExpression: 'cron(0 0 * * ? *)',
      target: {
        arn: `arn:aws:sagemaker:${Stack.of(this).region}:${Stack.of(this).account}:pipeline/${pipeline1.pipelineName}`,
        roleArn: sagemakerScheduleRole.roleArn,
        sageMakerPipelineParameters: {
          pipelineParameterList: [
            {
              name: "ProcessingInstanceType",
              value: "ml.m5.xlarge"
            },
            {
              name: "TrainingInstanceType",
              value: "ml.m5.xlarge"
            },
            {
              name: "TrainingInstanceCount",
              value: "1"
            },
            {
              name: "ModelApprovalStatus",
              value: "Approved"
            },
            {
              name: "DeployInstanceType",
              value: "ml.m5.large"
            },
            {
              name: "DeployInstanceCount",
              value: "1"
            },
            {
              name: "SkipModelBiasCheck",
              value: "false"
            },
            {
              name: "RegisterNewModelBiasBaseline",
              value: "false"
            }
          ]
        },
      },
    });
  }
}