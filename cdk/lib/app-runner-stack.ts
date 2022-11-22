import * as imports from "./app-runner.imports";
import * as interfaces from "./app-runner.interfaces";

export class AppRunnerStack extends imports.cdk.Stack {
  constructor(
    scope: imports.Construct,
    id: string,
    props?: imports.cdk.StackProps
  ) {
    super(scope, id, props);

    const appRunnerServices = 2;

    const network = this.setUpNetwork();
    const dynamoDB = this.setUpDynamoDB();
    const apiGateway = this.setUpAPIGW(network);

    for (let i = 1; i <= appRunnerServices; i++) {
      const appRunner = this.createAppRunnerService(i, dynamoDB, network);
      const connector = this.createAppRunnerConnector(
        i,
        network,
        appRunner.service
      );
      this.generateDynamoDBRecord(i, dynamoDB);
      this.createAPIGWResources(i, ["GET", "POST"], apiGateway, connector);
    }
  }

  /**
   * setUpNetwork
   * @returns interfaces.NetworkInterface
   */
  private setUpNetwork() {
    const vpc = new imports.Vpc(this, "Vpc", {
      ipAddresses: imports.IpAddresses.cidr("10.0.0.0/16"),
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "private-apprunner-subnet",
          subnetType: imports.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 20,
        },
      ],
    });

    const securityGroup = new imports.SecurityGroup(this, "app-runner-sg", {
      vpc,
      description: "Security group for App Runner private ingress and egress",
    });

    securityGroup.addIngressRule(
      imports.Peer.ipv4(vpc.vpcCidrBlock),
      imports.Port.tcp(443),
      "Allow TCP 443 traffic from VPC CIDR"
    );

    const nlb = new imports.NetworkLoadBalancer(this, "private-apprunner-nlb", {
      vpc,
    });

    const listener = nlb.addListener("Listener", {
      port: 443,
    });

    const targetGroup = new imports.NetworkTargetGroup(this, "TargetGroup", {
      vpc: vpc,
      targetType: imports.TargetType.IP,
      port: 443,
    });

    listener.addTargetGroups("TargetGroup", targetGroup);

    const appRunnerPrivateEndpoint = new imports.InterfaceVpcEndpoint(
      this,
      "AppRunnerPrivateEndpoint",
      {
        vpc,
        service: new imports.InterfaceVpcEndpointService(
          `com.amazonaws.${this.region}.apprunner.requests`,
          443
        ),
        securityGroups: [securityGroup],
      }
    );

    for (let i = 0; i < vpc.availabilityZones.length; i++) {
      const awsSdkCall: imports.AwsSdkCall = {
        service: "EC2",
        action: "describeNetworkInterfaces",
        outputPaths: [`NetworkInterfaces.${i}.PrivateIpAddress`],
        parameters: {
          NetworkInterfaceIds:
            appRunnerPrivateEndpoint.vpcEndpointNetworkInterfaceIds,
        },
        physicalResourceId: imports.PhysicalResourceId.fromResponse(
          `NetworkInterfaces.${i}.PrivateIpAddress`
        ),
      };

      const getEndpointIp = new imports.AwsCustomResource(
        this,
        `GetEndpointIp${i}`,
        {
          onCreate: awsSdkCall,
          onUpdate: awsSdkCall,
          policy: {
            statements: [
              new imports.PolicyStatement({
                actions: ["ec2:DescribeNetworkInterfaces"],
                resources: ["*"],
              }),
            ],
          },
        }
      );

      targetGroup.addTarget(
        new imports.IpTarget(
          imports.cdk.Token.asString(
            getEndpointIp.getResponseField(
              `NetworkInterfaces.${i}.PrivateIpAddress`
            )
          )
        )
      );
    }

    const vpcConnector = new imports.CfnVpcConnector(this, "VpcConnector", {
      subnets: vpc.selectSubnets({
        subnetType: imports.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
      securityGroups: [securityGroup.securityGroupId],
      vpcConnectorName: "vpc-connector-apprunner",
    });

    const dynamoDBEndpoint = vpc.addGatewayEndpoint("DynamoDBPrivateEndpoint", {
      service: imports.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: imports.SubnetType.PRIVATE_ISOLATED }],
    });

    const out: interfaces.NetworkInterface = {
      vpc: vpc,
      nlb: nlb,
      vpcConnector: vpcConnector,
      appRunnerEndpoint: appRunnerPrivateEndpoint,
      dynamoDBEndpoint: dynamoDBEndpoint,
    };

    return out;
  }

  /**
   * setUpDynamoDB
   * @returns interfaces.DynamoDBInterface
   */
  private setUpDynamoDB() {
    const dynamoDB = new imports.Table(this, "DynamoDBTable", {
      tableName: "environment",
      partitionKey: {
        name: "environment",
        type: imports.AttributeType.NUMBER,
      },
      billingMode: imports.BillingMode.PAY_PER_REQUEST,
      removalPolicy: imports.cdk.RemovalPolicy.DESTROY,
    });

    const dynamoRole = new imports.Role(this, "DynamoDBWriteRole", {
      assumedBy: new imports.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });

    dynamoRole.addToPolicy(
      new imports.PolicyStatement({
        resources: [dynamoDB.tableArn],
        actions: [
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:ConditionCheckItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:DeleteItem",
        ],
      })
    );

    const out: interfaces.DynamoDBInterface = {
      table: dynamoDB,
      role: dynamoRole,
    };

    return out;
  }

  /**
   * setUpAPIGW
   * @param network: interfaces.NetworkLoadBalancer
   * @returns interfaces.ApiGatewayInterface
   */
  private setUpAPIGW(network: interfaces.NetworkInterface) {
    const apiGW = new imports.RestApi(this, "ApiGatewayRestApi");
    const link = new imports.VpcLink(this, "vpc-link-to-nlb", {
      targets: [network.nlb],
    });

    const out: interfaces.ApiGatewayInterface = {
      apiGW: apiGW,
      link: link,
    };

    return out;
  }

  /**
   * createAppRunnerService
   * @param index: number
   * @param dynamoDB: interfaces.DynamoDBInterface
   * @param network: interfaces.NetworkInterface
   * @returns interfaces.AppRunnerInterface
   */
  private createAppRunnerService(
    index: number,
    dynamoDB: interfaces.DynamoDBInterface,
    network: interfaces.NetworkInterface
  ) {
    const appRunner = new imports.CfnService(this, `AppRunnerService${index}`, {
      sourceConfiguration: {
        imageRepository: {
          imageIdentifier: "public.ecr.aws/t5g2h6o3/arta:latest",
          imageRepositoryType: "ECR_PUBLIC",
          imageConfiguration: {
            port: "8000",
            runtimeEnvironmentVariables: [
              {
                name: "ENVIRONMENT",
                value: index.toString(),
              },
            ],
          },
        },
      },
      instanceConfiguration: {
        instanceRoleArn: dynamoDB.role.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: network.vpcConnector.attrVpcConnectorArn,
        },
        ingressConfiguration: {
          isPubliclyAccessible: false,
        },
      },
      serviceName: `private-endpoint-${index}`,
    });

    const out: interfaces.AppRunnerInterface = {
      service: appRunner,
    };

    return out;
  }

  /**
   * generateDynamoDBRecord
   * @param index number
   * @param dynamoDB interfaces.DynamoDBInterface
   */
  private generateDynamoDBRecord(
    index: number,
    dynamoDB: interfaces.DynamoDBInterface
  ) {
    const awsSdkCall: imports.AwsSdkCall = {
      service: "DynamoDB",
      action: "putItem",
      physicalResourceId: imports.PhysicalResourceId.of(
        `${dynamoDB.table.tableName}_insert`
      ),
      parameters: {
        TableName: dynamoDB.table.tableName,
        Item: {
          environment: {
            N: index.toString(),
          },
          createdAt: {
            S: new Date().toISOString().replace(/T/, " ").replace(/\..+/, ""),
          },
        },
      },
    };

    new imports.AwsCustomResource(this, `CustomResourceDynamoDB${index}`, {
      onCreate: awsSdkCall,
      onUpdate: awsSdkCall,
      policy: {
        statements: [
          new imports.PolicyStatement({
            sid: "DynamoWriteAccess",
            effect: imports.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [dynamoDB.table.tableArn],
          }),
        ],
      },
    });
  }

  /**
   * createAppRunnerConnector
   * @param index: number
   * @param network: interfaces.NetworkInterface
   * @param service: imports.CfnService
   * @returns imports.CfnVpcIngressConnection
   */
  private createAppRunnerConnector(
    index: number,
    network: interfaces.NetworkInterface,
    service: imports.CfnService
  ) {
    const vpcIngress = new imports.CfnVpcIngressConnection(
      this,
      `AppRunnerIngressConnection${index}`,
      {
        ingressVpcConfiguration: {
          vpcEndpointId: network.appRunnerEndpoint.vpcEndpointId,
          vpcId: network.vpc.vpcId,
        },
        serviceArn: service.attrServiceArn,
        vpcIngressConnectionName: `service-${index}-private-ingress-connection`,
      }
    );

    return vpcIngress;
  }

  /**
   * createAPIGWResources
   * @param index: number
   * @param methods: string[]
   * @param apiGateway: interfaces.ApiGatewayInterface
   * @param connector: imports.CfnVpcIngressConnection
   */
  private createAPIGWResources(
    index: number,
    methods: string[],
    apiGateway: interfaces.ApiGatewayInterface,
    connector: imports.CfnVpcIngressConnection
  ) {
    const endpoint = apiGateway.apiGW.root.addResource(
      `private-endpoint-${index}`
    );
    const env = endpoint.addResource("environment");
    const data = endpoint.addResource("data");
    const options: imports.cdk.aws_apigateway.IntegrationOptions = {
      connectionType: imports.ConnectionType.VPC_LINK,
      vpcLink: apiGateway.link,
    };

    env.addMethod(
      "GET",
      new imports.HttpIntegration(
        `https://${connector.attrDomainName}/api/environment`,
        { options }
      )
    );

    methods.forEach((method) => {
      data.addMethod(
        method,
        new imports.HttpIntegration(
          `https://${connector.attrDomainName}/api/data`,
          {
            options,
            httpMethod: method
          }
        )
      );
    });
  }
}
