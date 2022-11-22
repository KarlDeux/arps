import * as imports from "./app-runner.imports";

export interface NetworkInterface {
  vpc: imports.Vpc;
  nlb: imports.NetworkLoadBalancer;
  vpcConnector: imports.CfnVpcConnector;
  appRunnerEndpoint: imports.InterfaceVpcEndpoint;
  dynamoDBEndpoint: imports.GatewayVpcEndpoint;
}

export interface ApiGatewayInterface {
  apiGW: imports.RestApi;
  link: imports.VpcLink;
}

export interface DynamoDBInterface {
  table: imports.Table;
  role: imports.Role;
}

export interface AppRunnerInterface {
  service: imports.CfnService;
}
