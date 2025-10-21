#!/usr/bin/env node

const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
const dns = require('dns').promises;
const https = require('https');
const url = require('url');
require('dotenv').config();

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

async function runDiagnostics() {
  console.log(`${BLUE}🔍 OpenSearch Connection Diagnostics${RESET}`);
  console.log('=' * 50);
  
  // Check environment variables
  console.log(`\n${YELLOW}📋 Environment Variables:${RESET}`);
  console.log(`OPENSEARCH_ENDPOINT: ${process.env.OPENSEARCH_ENDPOINT || `${RED}NOT SET${RESET}`}`);
  console.log(`AWS_REGION: ${process.env.AWS_REGION || `${RED}NOT SET${RESET}`}`);
  console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? `${GREEN}SET${RESET}` : `${RED}NOT SET${RESET}`}`);
  console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? `${GREEN}SET${RESET}` : `${RED}NOT SET${RESET}`}`);
  console.log(`OPENSEARCH_INDEX: ${process.env.OPENSEARCH_INDEX || `${YELLOW}mydomain (default)${RESET}`}`);
  
  if (!process.env.OPENSEARCH_ENDPOINT) {
    console.log(`${RED}❌ OPENSEARCH_ENDPOINT is required${RESET}`);
    return;
  }
  
  const endpoint = process.env.OPENSEARCH_ENDPOINT;
  const parsedUrl = url.parse(endpoint);
  
  console.log(`\n${YELLOW}🌐 Endpoint Analysis:${RESET}`);
  console.log(`Host: ${parsedUrl.hostname}`);
  console.log(`Port: ${parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)}`);
  console.log(`Protocol: ${parsedUrl.protocol}`);
  
  // DNS Resolution Test
  console.log(`\n${YELLOW}🔍 DNS Resolution Test:${RESET}`);
  try {
    const addresses = await dns.resolve4(parsedUrl.hostname);
    console.log(`${GREEN}✅ DNS Resolution: SUCCESS${RESET}`);
    console.log(`Resolved IPs: ${addresses.join(', ')}`);
  } catch (error) {
    console.log(`${RED}❌ DNS Resolution: FAILED - ${error.message}${RESET}`);
    return;
  }
  
  // Basic HTTP/HTTPS connectivity test
  console.log(`\n${YELLOW}🔗 Basic Connectivity Test:${RESET}`);
  await testBasicConnectivity(endpoint);
  
  // OpenSearch client test
  console.log(`\n${YELLOW}🔐 OpenSearch Client Test:${RESET}`);
  await testOpenSearchClient();
  
  // Index existence test
  console.log(`\n${YELLOW}📁 Index Test:${RESET}`);
  await testIndexExists();
}

function testBasicConnectivity(endpoint) {
  return new Promise((resolve) => {
    const parsedUrl = url.parse(endpoint);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: '/',
      method: 'GET',
      timeout: 10000,
      rejectUnauthorized: false
    };
    
    const client = parsedUrl.protocol === 'https:' ? https : require('http');
    
    const req = client.request(options, (res) => {
      console.log(`${GREEN}✅ Basic connectivity: SUCCESS (Status: ${res.statusCode})${RESET}`);
      resolve();
    });
    
    req.on('timeout', () => {
      console.log(`${RED}❌ Basic connectivity: TIMEOUT (10s)${RESET}`);
      req.destroy();
      resolve();
    });
    
    req.on('error', (error) => {
      console.log(`${RED}❌ Basic connectivity: FAILED - ${error.message}${RESET}`);
      resolve();
    });
    
    req.setTimeout(10000);
    req.end();
  });
}

async function testOpenSearchClient() {
  try {
    const awsCredentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    
    const opensearchClient = new Client({
      ...AwsSigv4Signer({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'es',
        credentials: awsCredentials
      }),
      node: process.env.OPENSEARCH_ENDPOINT,
      requestTimeout: 30000,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    const startTime = Date.now();
    const info = await opensearchClient.info();
    const duration = Date.now() - startTime;
    
    console.log(`${GREEN}✅ OpenSearch client: SUCCESS (${duration}ms)${RESET}`);
    console.log(`Cluster: ${info.body.cluster_name}`);
    console.log(`Version: ${info.body.version.number}`);
    
    return opensearchClient;
  } catch (error) {
    console.log(`${RED}❌ OpenSearch client: FAILED - ${error.message}${RESET}`);
    
    if (error.message.includes('timeout')) {
      console.log(`${YELLOW}💡 Suggestion: Check security groups and network ACLs${RESET}`);
    } else if (error.message.includes('403')) {
      console.log(`${YELLOW}💡 Suggestion: Check IAM permissions and access policy${RESET}`);
    } else if (error.message.includes('ENOTFOUND')) {
      console.log(`${YELLOW}💡 Suggestion: Check DNS resolution and VPC configuration${RESET}`);
    }
    
    return null;
  }
}

async function testIndexExists() {
  try {
    const awsCredentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    
    const opensearchClient = new Client({
      ...AwsSigv4Signer({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'es',
        credentials: awsCredentials
      }),
      node: process.env.OPENSEARCH_ENDPOINT,
      requestTimeout: 30000,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    const indexName = process.env.OPENSEARCH_INDEX || 'mydomain';
    const exists = await opensearchClient.indices.exists({ index: indexName });
    
    if (exists.body) {
      console.log(`${GREEN}✅ Index '${indexName}': EXISTS${RESET}`);
      
      // Get index stats
      const stats = await opensearchClient.indices.stats({ index: indexName });
      const docCount = stats.body.indices[indexName].total.docs.count;
      console.log(`Document count: ${docCount}`);
    } else {
      console.log(`${YELLOW}⚠️  Index '${indexName}': DOES NOT EXIST${RESET}`);
      console.log(`${YELLOW}💡 Suggestion: Create the index or check OPENSEARCH_INDEX variable${RESET}`);
    }
  } catch (error) {
    console.log(`${RED}❌ Index test: FAILED - ${error.message}${RESET}`);
  }
}

// Run diagnostics
runDiagnostics().catch(console.error);