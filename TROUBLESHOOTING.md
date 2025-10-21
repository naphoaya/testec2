# OpenSearch Connection Troubleshooting Guide

## Quick Diagnosis

Run the diagnostic script to identify the issue:
```bash
node diagnose.js
```

## Common Issues and Solutions

### 1. **Request Timeout Errors**
**Symptoms:** "Request timed out", connection hangs
**Causes:**
- Security group doesn't allow traffic
- Network ACL blocking traffic  
- Wrong VPC/subnet configuration
- OpenSearch domain not in same VPC

**Solutions:**
```bash
# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxxxxxxxx

# Check if EC2 can reach OpenSearch endpoint
curl -v https://your-opensearch-endpoint.amazonaws.com

# Test network connectivity
nc -zv your-opensearch-endpoint.amazonaws.com 443
```

### 2. **DNS Resolution Issues**
**Symptoms:** "ENOTFOUND", "getaddrinfo ENOTFOUND"
**Solutions:**
```bash
# Test DNS resolution
nslookup your-opensearch-endpoint.amazonaws.com
dig your-opensearch-endpoint.amazonaws.com

# Check /etc/resolv.conf
cat /etc/resolv.conf
```

### 3. **Security Group Configuration**
**Required Rules for EC2 Security Group:**
- **Outbound:** Port 443 (HTTPS) to OpenSearch security group or 0.0.0.0/0
- **Outbound:** Port 53 (DNS) to 0.0.0.0/0

**Required Rules for OpenSearch Security Group:**
- **Inbound:** Port 443 from EC2 security group or specific IP range

### 4. **OpenSearch Domain Access Policy**
Make sure your domain access policy allows your EC2 instance:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": "es:*",
      "Resource": "arn:aws:es:region:account:domain/domain-name/*",
      "Condition": {
        "IpAddress": {
          "aws:sourceIp": ["your-ec2-ip/32"]
        }
      }
    }
  ]
}
```

### 5. **IAM Permissions**
Ensure your AWS credentials have these permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "es:ESHttpGet",
                "es:ESHttpPost",
                "es:ESHttpPut",
                "es:ESHttpDelete",
                "es:ESHttpHead"
            ],
            "Resource": "arn:aws:es:*:*:domain/*/*"
        }
    ]
}
```

### 6. **Network Debugging Commands**

```bash
# Check if port 443 is reachable
telnet your-opensearch-endpoint.amazonaws.com 443

# Check routing
traceroute your-opensearch-endpoint.amazonaws.com

# Check current security groups
curl -s http://169.254.169.254/latest/meta-data/security-groups

# Check instance metadata
curl -s http://169.254.169.254/latest/meta-data/instance-id
curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone
```

### 7. **VPC Configuration Checklist**

- [ ] EC2 instance and OpenSearch domain are in the same VPC
- [ ] Subnets have proper routing to internet gateway (for public domains) or NAT gateway
- [ ] Network ACLs allow traffic on port 443
- [ ] Route tables are correctly configured
- [ ] DNS resolution is enabled in VPC settings

### 8. **Environment Variables**

Make sure all required environment variables are set:
```bash
export OPENSEARCH_ENDPOINT="https://your-domain.region.es.amazonaws.com"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export OPENSEARCH_INDEX="mydomain"
```

### 9. **Docker Environment Variables**

If running in Docker, pass environment variables:
```bash
docker run -e OPENSEARCH_ENDPOINT="https://..." \
           -e AWS_REGION="us-east-1" \
           -e AWS_ACCESS_KEY_ID="..." \
           -e AWS_SECRET_ACCESS_KEY="..." \
           -e OPENSEARCH_INDEX="mydomain" \
           your-image
```

### 10. **Testing Steps**

1. **Test basic connectivity:**
   ```bash
   curl -v https://your-opensearch-endpoint.amazonaws.com
   ```

2. **Test with AWS CLI:**
   ```bash
   aws es describe-elasticsearch-domain --domain-name your-domain
   ```

3. **Test the connection endpoint:**
   ```bash
   curl http://your-ec2-ip:3000/test-connection
   ```

4. **Check application logs:**
   ```bash
   docker logs testec2
   ```

## Quick Fixes to Try

1. **Increase timeout in code** (already done)
2. **Disable SSL verification** (already done for testing)
3. **Check if using VPC endpoint vs public endpoint**
4. **Verify region consistency**
5. **Test with different index name**

## Need More Help?

1. Run `node diagnose.js` and share the output
2. Check your OpenSearch domain configuration in AWS Console
3. Verify your EC2 instance can access other AWS services
4. Test connection from different EC2 instance in same VPC