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

// Validate required environment variables
const requiredEnvVars = [
  'OPENSEARCH_ENDPOINT',
  'AWS_ACCESS_KEY_ID', 
  'AWS_SECRET_ACCESS_KEY',
  'FIREHOSE_DELIVERY_STREAM_NAME'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('Please set the following environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  process.exit(1);
}

// Configure OpenSearch client with credentials
const opensearchClient = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION || 'us-east-1',
    service: 'es',
    credentials: awsCredentials
  }),
  node: process.env.OPENSEARCH_ENDPOINT,
  requestTimeout: 60000, // Increase timeout to 60 seconds
  compression: 'gzip',
  ssl: {
    rejectUnauthorized: false // For development/testing
  }
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
    hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    region: process.env.AWS_REGION || 'us-east-1'
  });
});

// Test OpenSearch connection
app.get('/test-connection', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Testing OpenSearch connection...');
    console.log('Endpoint:', process.env.OPENSEARCH_ENDPOINT);
    console.log('Region:', process.env.AWS_REGION || 'us-east-1');
    
    // Test basic connectivity first
    const info = await opensearchClient.info();
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      message: 'OpenSearch connection successful!',
      connectionTime: `${duration}ms`,
      opensearchVersion: info.body.version.number,
      clusterName: info.body.cluster_name,
      endpoint: process.env.OPENSEARCH_ENDPOINT,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ OpenSearch connection failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: error.code,
      connectionTime: `${duration}ms`,
      endpoint: process.env.OPENSEARCH_ENDPOINT,
      troubleshooting: {
        networkIssue: error.message.includes('timeout') || error.message.includes('ENOTFOUND'),
        authIssue: error.message.includes('403') || error.message.includes('Forbidden'),
        configIssue: error.message.includes('404') || error.message.includes('Not Found')
      },
      timestamp: new Date().toISOString()
    });
  }
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
  const startTime = Date.now();
  
  try {
    const indexName = process.env.OPENSEARCH_INDEX || 'mydomain';
    const size = parseInt(req.query.size) || 10;
    const from = parseInt(req.query.from) || 0;

    console.log('🔍 Querying real OpenSearch from EC2...');
    console.log('Index:', indexName);
    console.log('Endpoint:', process.env.OPENSEARCH_ENDPOINT);
    
    // First check if the index exists
    const indexExists = await opensearchClient.indices.exists({
      index: indexName
    });
    
    if (!indexExists.body) {
      return res.status(404).json({
        success: false,
        error: `Index '${indexName}' does not exist`,
        suggestion: 'Check your OPENSEARCH_INDEX environment variable or create the index first',
        timestamp: new Date().toISOString()
      });
    }
    
    const response = await opensearchClient.search({
      index: indexName,
      body: {
        query: { match_all: {} },
        size: size,
        from: from,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      total: response.body.hits.total.value || response.body.hits.total,
      count: response.body.hits.hits.length,
      data: response.body.hits.hits.map(hit => ({
        id: hit._id,
        source: hit._source,
        score: hit._score
      })),
      queryTime: `${duration}ms`,
      note: 'Real OpenSearch data successfully retrieved from EC2!',
      endpoint: process.env.OPENSEARCH_ENDPOINT,
      index: indexName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Real OpenSearch query failed:', error.message);
    console.error('Error details:', {
      code: error.code,
      statusCode: error.statusCode,
      meta: error.meta
    });
    
    res.status(500).json({
      success: false,
      error: `Failed to query real OpenSearch: ${error.message}`,
      errorCode: error.code,
      statusCode: error.statusCode,
      queryTime: `${duration}ms`,
      troubleshooting: {
        timeoutIssue: error.message.includes('timeout') || error.message.includes('Request timed out'),
        networkIssue: error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED'),
        authIssue: error.message.includes('403') || error.message.includes('Forbidden'),
        indexIssue: error.message.includes('404') || error.message.includes('index_not_found_exception')
      },
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
