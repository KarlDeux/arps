const express = require("express");
const bodyParser = require("body-parser");
const AWS = require("aws-sdk");

AWS.config.update({ region: region });

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
const app = express();
const port = process.env.PORT || 8000;

const environment = process.env.ENVIRONMENT
  ? process.env.ENVIRONMENT
  : "not informed";
const table = process.env.TABLE ? process.env.TABLE : "environment";
const region = process.env.REGION ? process.env.REGION : "us-east-1";

console.log("ENVIRONMENT: ", environment);
console.log("TABLE: ", table);
console.log("REGION: ", region);

app.use(bodyParser.json());

app.get("/", (req, res) => {
  console.info("root route");
  res.send(process.env.API_WORKS_MESSAGE);
});

app.get("/api/environment", (req, res) => {
  console.info("environment data route");
  res.json([
    {
      environment: `${environment}`,
    },
  ]);
});

app.get("/api/data", (req, res) => {
  console.info("api data route");
  let params = {
    TableName: table,
    Key: {
      environment: { N: environment },
    },
    ProjectionExpression: "createdAt",
  };

  ddb.getItem(params, function (err, data) {
    if (err) {
      res.json(err);
    } else {
      res.json(data.Item);
    }
  });
});

app.listen(port, (err) => {
  if (err) {
    console.error("Error:", err);
  }
  console.info(`listening port ${port}`);
});
