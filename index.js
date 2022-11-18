const express = require("express");
const bodyParser = require("body-parser");
const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
const app = express();
const port = process.env.PORT || 8000;

const environment = process.env.ENVIRONMENT
  ? process.env.ENVIRONMENT
  : "not informed";
const table = process.env.TABLE ? process.env.TABLE : "environment";
const region = process.env.REGION ? process.env.REGION : "us-east-1";

AWS.config.update({ region: region });

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
  console.info("api data GET route");
  const params = {
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

app.post("/api/data", (req, res) => {
  console.info("api data POST route");
  const date = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
  const params = {
    TableName: table,
    Key: {
      environment: { N: environment },
    },
    UpdateExpression: "set postedAt = :r",
    ExpressionAttributeValues: {
      ":r": date,
    },
  };

  ddb.updateItem(params, function (err, data) {
    if (err) {
      res.json(err);
    } else {
      console.log("Success - item added or updated", data);
    }
  });
});

app.listen(port, (err) => {
  if (err) {
    console.error("Error:", err);
  }
  console.info(`listening port ${port}`);
});
