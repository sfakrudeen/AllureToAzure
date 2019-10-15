import tl = require('azure-pipelines-task-lib/task');
import * as publisher from './publisher';

async function run() {
    try {
        const runname: string|undefined = tl.getInput('runname', true);
        const path: string|undefined = tl.getInput('path', true);
        

        if(!runname || !path){
            tl.setResult(tl.TaskResult.Failed, 'Bad input was given');
            return;
        }
        
        let pub = new publisher.TestResultsPublisher(runname!,path!);
        await pub.run();
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }



}



run();