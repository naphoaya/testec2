// Simple script to list OpenSearch indices
// Run this inside Docker container: docker exec -it testec2 node list-indices.js

const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
require('dotenv').config();

async function listIndices() {
  try {
    const awsCredentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    
    const client = new Client({
      ...AwsSigv4Signer({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'es',
        credentials: awsCredentials
      }),
      node: process.env.OPENSEARCH_ENDPOINT,
      requestTimeout: 60000,
      ssl: { rejectUnauthorized: false }
    });
    
    console.log('🔍 Connecting to OpenSearch...');
    console.log('Endpoint:', process.env.OPENSEARCH_ENDPOINT);
    
    // List all indices
    const response = await client.cat.indices({
      format: 'json',
      v: true
    });
    
    console.log('\n📁 Available indices:');
    if (response.body && response.body.length > 0) {
      response.body.forEach(index => {
        console.log(`  - ${index.index} (${index['docs.count'] || 0} docs, ${index['store.size'] || '0b'})`);
      });
    } else {
      console.log('  No indices found. You may need to create one first.');
    }
    
    // Test connection
    const info = await client.info();
    console.log('\n✅ Connection successful!');
    console.log(`Cluster: ${info.body.cluster_name}`);
    console.log(`Version: ${info.body.version.number}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 Network issue detected. Check:');
      console.log('  - Security groups (EC2 outbound port 443)');
      console.log('  - OpenSearch security group (inbound port 443)');
      console.log('  - VPC configuration');
    } else if (error.message.includes('403')) {
      console.log('\n💡 Permission issue detected. Check:');
      console.log('  - IAM permissions');
      console.log('  - OpenSearch access policy');
    }
  }
}

listIndices();