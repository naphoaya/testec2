const express = require('express');
const cors = require('cors');
const { FirehoseClient, PutRecordCommand } = require('@aws-sdk/client-firehose');
const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Use AWS credentials from environment variables
const awsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

// Configure Firehose client with credentials
const firehoseClient = new FirehoseClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: awsCredentials
});

// Configure OpenSearch client with credentials
const opensearchClient = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION || 'us-east-1',
    service: 'es',
    credentials: awsCredentials
  }),
  node: process.env.OPENSEARCH_ENDPOINT,
  requestTimeout: 30000
});

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Running on EC2 with VPC OpenSearch access and AWS credentials!',
    timestamp: new Date().toISOString(),
    environment: 'production',
    opensearchEndpoint: process.env.OPENSEARCH_ENDPOINT,
    firehoseStream: process.env.FIREHOSE_DELIVERY_STREAM_NAME,
    hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  });
});

// Send data to Firehose
app.post('/send', async (req, res) => {
  try {
    const data = req.body;
    const record = {
      ...data,
      timestamp: new Date().toISOString(),
      '@timestamp': new Date().toISOString()
    };

    const params = {
      DeliveryStreamName: process.env.FIREHOSE_DELIVERY_STREAM_NAME,
      Record: {
        Data: JSON.stringify(record) + '\n'
      }
    };

    const command = new PutRecordCommand(params);
    const result = await firehoseClient.send(command);

    res.json({
      success: true,
      message: 'Data sent to Firehose successfully',
      recordId: result.RecordId,
      data: data,
      timestamp: new Date().toISOString()
    });

    console.log('Data sent:', { recordId: result.RecordId, data });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send pipe-20 data specifically
app.post('/send-pipe-data', async (req, res) => {
  try {
    const pipeData = req.body || { "pipe-20": 112 };
    
    const record = {
      ...pipeData,
      timestamp: new Date().toISOString(),
      '@timestamp': new Date().toISOString()
    };

    const params = {
      DeliveryStreamName: process.env.FIREHOSE_DELIVERY_STREAM_NAME,
      Record: {
        Data: JSON.stringify(record) + '\n'
      }
    };

    const command = new PutRecordCommand(params);
    const result = await firehoseClient.send(command);

    res.json({
      success: true,
      message: 'Pipe data sent to Firehose successfully',
      recordId: result.RecordId,
      data: pipeData,
      timestamp: new Date().toISOString()
    });

    console.log('Pipe data sent:', { recordId: result.RecordId, data: pipeData });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Search OpenSearch - Real VPC access
app.get('/search/all', async (req, res) => {
  try {
    const size = parseInt(req.query.size) || 10;
    const from = parseInt(req.query.from) || 0;

    const response = await opensearchClient.search({
      index: process.env.OPENSEARCH_INDEX || 'mydomain',
      body: {
        query: { match_all: {} },
        size: size,
        from: from,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    res.json({
      success: true,
      total: response.body.hits.total.value || response.body.hits.total,
      count: response.body.hits.hits.length,
      data: response.body.hits.hits.map(hit => ({
        id: hit._id,
        source: hit._source,
        score: hit._score
      })),
      note: 'Real data from VPC OpenSearch domain!',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Search for pipe-20 data specifically
app.get('/search/pipe-data', async (req, res) => {
  try {
    const size = parseInt(req.query.size) || 10;

    const response = await opensearchClient.search({
      index: process.env.OPENSEARCH_INDEX || 'mydomain',
      body: {
        query: { exists: { field: 'pipe-20' } },
        size: size,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    res.json({
      success: true,
      total: response.body.hits.total.value || response.body.hits.total,
      count: response.body.hits.hits.length,
      data: response.body.hits.hits.map(hit => ({
        id: hit._id,
        source: hit._source,
        score: hit._score
      })),
      note: 'Real pipe-20 data from OpenSearch!',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Pipe data search error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Real OpenSearch query endpoint
app.get('/search/real-opensearch', async (req, res) => {
  try {
    const indexName = process.env.OPENSEARCH_INDEX || 'mydomain';
    const size = parseInt(req.query.size) || 10;
    const from = parseInt(req.query.from) || 0;

    console.log('🔍 Querying real OpenSearch from EC2...');
    
    const response = await opensearchClient.search({
      index: indexName,
      body: {
        query: { match_all: {} },
        size: size,
        from: from,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    res.json({
      success: true,
      total: response.body.hits.total.value || response.body.hits.total,
      count: response.body.hits.hits.length,
      data: response.body.hits.hits.map(hit => ({
        id: hit._id,
        source: hit._source,
        score: hit._score
      })),
      note: 'Real OpenSearch data successfully retrieved from EC2!',
      endpoint: process.env.OPENSEARCH_ENDPOINT,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Real OpenSearch query failed:', error.message);
    res.status(500).json({
      success: false,
      error: `Failed to query real OpenSearch: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Firehose API running on http://0.0.0.0:${port}`);
  console.log(`🔍 OpenSearch: ${process.env.OPENSEARCH_ENDPOINT}`);
  console.log(`📤 Firehose: ${process.env.FIREHOSE_DELIVERY_STREAM_NAME}`);
  console.log(`🔐 Using AWS credentials: ${process.env.AWS_ACCESS_KEY_ID ? 'Yes' : 'No'}`);
  console.log('🎯 VPC OpenSearch access enabled with credentials!');
});
