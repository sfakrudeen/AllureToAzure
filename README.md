# AllureToAzure

This Azure Devops task will read the allure report data and push the data in Azure Devops Test Results.

# How to build this code and publish

To build, publish and use this task folow the steps [here](https://docs.microsoft.com/en-us/azure/devops/extend/develop/add-build-task?view=azure-devops) 

When publishing please change the publisherid in vss-extension.json to yours.


# About the plugin

Currently it is tested against Allure + Testng.

Though this plubin uploads allure test results to Azure Devops Test Results, not all features supported by Allure is available in Azure Devops Test Results. This plubin will be useful if you want to upload test result of Web tests that has step details and screenshots.






