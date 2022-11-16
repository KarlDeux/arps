const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 8000;
const environment = process.env.ENVIRONMENT ?
    process.env.ENVIRONMENT :
    "not informed";

console.log('ENVIRONMENT: ', environment);

const data = [{id: 1, attribute: "test1" }, {id: 2, attribute: "test2" }];

app.use(bodyParser.json());

app.get('/', (req, res) => {
    console.info('root route');
    res.send(process.env.API_WORKS_MESSAGE);
});

app.get('/api/environment', (req, res) => {
    console.info(`environment ${environment}`);
    res.json([{
        environment: `${environment}`
    }]);
});

app.get('/api/test', (req, res) => {
    console.info('api test route');
    res.json(data);
});

app.post('/api/test', (req, res) => {
    console.info(`post`);
    data.push(req.body);
    res.json(data);
});

app.get('/api/test/:attribute', (req, res) => {
    console.info(`filter by attribute:${req.params.attribute}`);
    res.json(data.filter(x => req.params.attribute === x.attribute));
});

app.listen(port, (err) => {
    if (err) {
        console.error('Error:', err);
    }
    console.info(`listening port ${port}`);
});