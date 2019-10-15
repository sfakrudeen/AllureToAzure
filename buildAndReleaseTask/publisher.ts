import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';
import * as tr from 'azure-pipelines-task-lib/toolrunner';
import * as azdev from "azure-devops-node-api";
import * as util from "util";
import { ResultSet } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import * as test from 'azure-devops-node-api/interfaces/TestInterfaces';
import * as itest from 'azure-devops-node-api/TestApi';

let uuid = require('uuid');

const readDir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);


export class TestResultsPublisher {
    runname: string;
    resultPath: string;

    constructor(runname: string, resultPath: string) {
        this.runname = runname;
        this.resultPath = resultPath;

    }




    private getEnvironmentVariables(): { [key: string]: string; } {
        let envVars: { [key: string]: string } = {};

        envVars = this.addToProcessEnvVars(envVars,
            'collectionurl',
            tl.getVariable('System.TeamFoundationCollectionUri')!);
        envVars = this.addToProcessEnvVars(envVars,
            'accesstoken',
            tl.getEndpointAuthorizationParameter('SystemVssConnection', 'AccessToken', false)!);

        envVars = this.addToProcessEnvVars(envVars, 'runTitle', this.runname);
        envVars = this.addToProcessEnvVars(envVars, 'workingdir', tl.getVariable('System.DefaultWorkingDirectory')!);
        envVars = this.addToProcessEnvVars(envVars, 'projectname', tl.getVariable('System.TeamProject')!);
        envVars = this.addToProcessEnvVars(envVars, 'pullrequesttargetbranch', tl.getVariable('System.PullRequest.TargetBranch')!);
        envVars = this.addToProcessEnvVars(envVars, 'owner', tl.getVariable('Build.RequestedFor')!);
        envVars = this.addToProcessEnvVars(envVars, 'buildid', tl.getVariable('Build.BuildId')!);
        envVars = this.addToProcessEnvVars(envVars, 'builduri', tl.getVariable('Build.BuildUri')!);
        envVars = this.addToProcessEnvVars(envVars, 'releaseuri', tl.getVariable('Release.ReleaseUri')!);
        envVars = this.addToProcessEnvVars(envVars, 'releaseenvironmenturi', tl.getVariable('Release.EnvironmentUri')!);
        envVars = this.addToProcessEnvVars(envVars, 'phasename', tl.getVariable('System.PhaseName')!);
        envVars = this.addToProcessEnvVars(envVars, 'phaseattempt', tl.getVariable('System.PhaseAttempt')!);
        envVars = this.addToProcessEnvVars(envVars, 'stagename', tl.getVariable('System.StageName')!);
        envVars = this.addToProcessEnvVars(envVars, 'stageattempt', tl.getVariable('System.StageAttempt')!);
        envVars = this.addToProcessEnvVars(envVars, 'jobname', tl.getVariable('System.JobName')!);
        envVars = this.addToProcessEnvVars(envVars, 'jobattempt', tl.getVariable('System.JobAttempt')!);
        envVars = this.addToProcessEnvVars(envVars, 'jobidentifier', tl.getVariable('System.JobIdentifier')!);
        return envVars;
    }

    private addToProcessEnvVars(envVars: { [key: string]: string; }, name: string, value: string): { [key: string]: string; } {
        if (!this.isNullEmptyOrUndefined(value)) {
            envVars[name] = value;
        }

        return envVars;
    }

    private isNullEmptyOrUndefined(obj: any): boolean {
        return obj === null || obj === '' || obj === undefined;
    }

    public async run() {

        let env = this.getEnvironmentVariables();
        let authHandler = azdev.getPersonalAccessTokenHandler(env['accesstoken']);
        let connection = new azdev.WebApi(env['collectionurl'], authHandler);
        let testApi = await connection.getTestApi();

        const dir = env['workingdir'] + '/'+this.resultPath;
        console.log(dir);

        let fileNames = await readDir(dir); //TODO
        let contents = [];
        for (let i = 0; i < fileNames.length; i++) {
            const name = path.parse(fileNames[i]).name;
            const ext = path.parse(fileNames[i]).ext;
            const filepath = path.resolve(dir, fileNames[i]);
            if (name.endsWith('result')) {
                let content = await readFile(filepath);
                contents.push(content);
            }


        }

        console.log(contents);
        // @ts-ignore
        let runCreateModelRes: test.RunCreateModel = {
            name: 'Sample',
            automated: true,
            configurationIds: [],
            build: {
                id: env['buildid']
            }

        }
        console.log('created test api')
        let run = await testApi.createTestRun(runCreateModelRes, env['projectname']);
        let testResults = [];

        for (let i = 0; i < contents.length; i++) {
            let content = JSON.parse(contents[i].toString());

            // let additionalFields = [];
            // if (content.labels) {

            //     for (let k = 0; k < content.labels.length; k++) {
            //         let temping = {
            //             fieldName: content.labels[k].name,
            //             value: content.labels[k].value
            //         }
            //         additionalFields.push(temping)
            //     }


            // }
            // console.log(JSON.stringify(additionalFields))

            let testResult: test.TestCaseResult = {
                testCaseTitle: content.name,
                automatedTestName: content.fullName,
                automatedTestId: content.fullName,
                automatedTestStorage: content.fullName,
                outcome: 'Passed',
                state: 'Completed',
                startedDate: new Date(content.start),
                completedDate: new Date(content.stop),
                errorMessage: '',
                stackTrace: ''

            }

            let outcome = 'Passed';
            if (content.status == 'failed') {
                testResult.outcome = 'Failed';

                testResult.errorMessage = content.statusDetails.message;
                testResult.stackTrace = content.statusDetails.trace;

            } else if (content.status == 'skipped') {
                testResult.outcome = 'NotExecuted';

            }
            testResults.push(testResult);
        }
        console.log(JSON.stringify(testResults))
        let result = await testApi.addTestResultsToTestRun(testResults, env['projectname'], run.id);
        console.log('after adding test')
        console.log(JSON.stringify(result))

        for (let i = 0; i < result.length; i++) {
            let content = JSON.parse(contents[i].toString());
            console.log(contents[i].toString())
            await this.addAttachments(testApi, content.attachments, env['projectname'], run.id, result[i].id, dir);
            await this.addTestSteps(testApi, content.steps, env['projectname'], run.id, result[i].id, dir);

        }
        await testApi.updateTestRun({ state: 'Completed' }, env['projectname'], run.id);
        return result;





    }

    private async addTestSteps(testApi: itest.ITestApi, stepDetails: any[], project: string, runId: number, resultId: number | undefined, dir: string) {
        if (!stepDetails) {
            return;
        }
        for (let i = 0; i < stepDetails.length; i++) {
            let temp: test.TestAttachmentRequestModel = {
                comment: stepDetails[i].name,
                fileName: 'Step_' + i + '.txt',
                stream: Buffer.from(stepDetails[i].name).toString('base64')
            }
            console.log('test steps ' + resultId)
            console.log(temp)
            await testApi.createTestResultAttachment(temp, project, runId, resultId!);
            if (stepDetails[i].attachments) {
                let attachments = stepDetails[i].attachments;
                for (let j = 0; j < attachments.length; j++) {
                    if (attachments[j]) {
                        let content = await readFile(dir + '/' + attachments[j].source);
                        let temp1 = {
                            comment: 'Screenshot_' + j,
                            fileName: 'Step_' + i + '_Screenshot_' + j + '.png',
                            stream: Buffer.from(content).toString('base64')

                        }
                        await testApi.createTestResultAttachment(temp1, project, runId, resultId!);
                    }
                }

            }
        }

    }

    private async addAttachments(testApi: itest.ITestApi, attachments: any[], project: string, runId: number, resultId: number | undefined, dir: string) {
        if (!attachments) {
            return;
        }
        for (let j = 0; j < attachments.length; j++) {
            if (attachments[j]) {
                let content = await readFile(dir + '/' + attachments[j].source)
                let temp1 = {
                    comment: 'Test Screenshot_' + j,
                    fileName: 'Test_Screenshot_' + j + '.png',
                    stream: Buffer.from(content).toString('base64')

                }
                await testApi.createTestResultAttachment(temp1, project, runId, resultId!)
            }
        }

    }


}