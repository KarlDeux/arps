# App Runner Private Services

![architecture](https://github.com/karldeux/arps/blob/master/training.jpg?raw=true)

API Gateway + VPC Link + NLB + VPC Endpoint + App Runner + VPC Connector + VPC Endpoint + DynamoDB

This project consists on a Node.JS / Express backend application that is launched via App Runner with private Ingress and Egress.
API Gateway will interact with the application and the application will reach DynamoDB (privately via VPC Endpoint).

It is essentially a 3 layers App:

- Front: API Gateway
- Back: App Runner
- Data: DynamoDB

See [template.yaml](https://github.com/karldeux/arps/blob/master/template.yaml) for CloudFormation example.

See [cdk](https://github.com/karldeux/arps/blob/master/cdk) for CDK example.
