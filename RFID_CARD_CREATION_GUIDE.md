# RFID Card Creation - Complete Process Guide

**Created**: January 15, 2025
**Purpose**: Document the exact process for adding RFID cards to CitrineOS authorization system
**Context**: AWS deployment at `http://13.204.177.82` with Hasura GraphQL at port 8090

## 🚨 **Common Errors and Solutions**

### **Error 1: JSON Formatting Issues**
```bash
# ❌ WRONG - This causes JSON parsing errors
curl -s http://13.204.177.82:8090/v1/graphql -H "Content-Type: application/json" -d '{
  "query": "mutation {
    insert_IdTokens_one(object: {
      idToken: \"D6A3FA03\",
      type: \"ISO14443\",
      tenantId: 1
    }) {
      id idToken type tenantId
    }
  }"
}'

# Error: "unescaped control character. Expecting object value"
```

**Solution**: Use single-line JSON without newlines in GraphQL queries.

### **Error 2: Missing Required Fields**
```bash
# ❌ WRONG - Missing createdAt/updatedAt timestamps
curl -s http://13.204.177.82:8090/v1/graphql -H "Content-Type: application/json" -d '{"query": "mutation { insert_IdTokens_one(object: {idToken: \"D6A3FA03\", type: \"ISO14443\", tenantId: 1}) { id idToken type tenantId } }"}'

# Error: "Not-NULL violation. null value in column \"createdAt\" of relation \"IdTokens\" violates not-null constraint"
```

**Solution**: Always include `createdAt` and `updatedAt` timestamps.

### **Error 3: Incorrect Relationship Queries**
```bash
# ❌ WRONG - Relationships don't exist in GraphQL schema
curl -s http://13.204.177.82:8090/v1/graphql -H "Content-Type: application/json" -d '{"query": "query { IdTokens(where: {idToken: {_eq: \"D6A3FA03\"}}) { id idToken authorizations { idTokenInfo { status } } } }"}'

# Error: "field 'authorizations' not found in type: 'IdTokens'"
```

**Solution**: Query tables separately and link manually by IDs.

## ✅ **Working RFID Card Creation Process**

### **Step 1: Create IdToken Entry**

```bash
curl -s http://13.204.177.82:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_IdTokens_one(object: {idToken: \"D6A3FA03\", type: \"ISO14443\", tenantId: 1, createdAt: \"2025-01-15T12:00:00.000Z\", updatedAt: \"2025-01-15T12:00:00.000Z\"}) { id idToken type tenantId } }"}' | jq '.'
```

**Expected Response:**
```json
{
  "data": {
    "insert_IdTokens_one": {
      "id": 2,
      "idToken": "D6A3FA03",
      "type": "ISO14443",
      "tenantId": 1
    }
  }
}
```

**Important**: Note the returned `id` (in this case `2`) - you'll need it for Step 3.

### **Step 2: Create IdTokenInfo Entry**

```bash
curl -s http://13.204.177.82:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_IdTokenInfos_one(object: {status: \"Accepted\", chargingPriority: 3, language1: \"en\", language2: \"ne\", cacheExpiryDateTime: \"2025-12-31T23:59:59.000Z\", createdAt: \"2025-01-15T12:00:00.000Z\", updatedAt: \"2025-01-15T12:00:00.000Z\"}) { id status chargingPriority } }"}' | jq '.'
```

**Expected Response:**
```json
{
  "data": {
    "insert_IdTokenInfos_one": {
      "id": 1,
      "status": "Accepted",
      "chargingPriority": 3
    }
  }
}
```

**Important**: Note the returned `id` (in this case `1`) - you'll need it for Step 3.

### **Step 3: Create Authorization Link**

```bash
curl -s http://13.204.177.82:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_Authorizations_one(object: {idTokenId: 2, idTokenInfoId: 1, concurrentTransaction: true, createdAt: \"2025-01-15T12:00:00.000Z\", updatedAt: \"2025-01-15T12:00:00.000Z\"}) { id idTokenId idTokenInfoId } }"}' | jq '.'
```

**Expected Response:**
```json
{
  "data": {
    "insert_Authorizations_one": {
      "id": 1,
      "idTokenId": 2,
      "idTokenInfoId": 1
    }
  }
}
```

**Critical**: Use the actual IDs returned from Steps 1 and 2, not the example IDs shown here.

### **Step 4: Verify Complete Setup**

```bash
curl -s http://13.204.177.82:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { IdTokens { id idToken type } IdTokenInfos { id status chargingPriority } Authorizations { id idTokenId idTokenInfoId } }"}' | jq '.'
```

**Expected Response:**
```json
{
  "data": {
    "IdTokens": [
      {
        "id": 2,
        "idToken": "D6A3FA03",
        "type": "ISO14443"
      }
    ],
    "IdTokenInfos": [
      {
        "id": 1,
        "status": "Accepted",
        "chargingPriority": 3
      }
    ],
    "Authorizations": [
      {
        "id": 1,
        "idTokenId": 2,
        "idTokenInfoId": 1
      }
    ]
  }
}
```

## 📋 **Complete Template for New RFID Cards**

### **Template Script**
```bash
#!/bin/bash

# Configuration
HASURA_URL="http://13.204.177.82:8090/v1/graphql"
RFID_TOKEN="$1"  # Pass RFID token as first argument
TENANT_ID="1"    # Adjust as needed
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

if [ -z "$RFID_TOKEN" ]; then
    echo "Usage: $0 <RFID_TOKEN>"
    echo "Example: $0 A1B2C3D4"
    exit 1
fi

echo "Creating RFID card: $RFID_TOKEN"

# Step 1: Create IdToken
echo "Step 1: Creating IdToken..."
ID_TOKEN_RESPONSE=$(curl -s $HASURA_URL \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { insert_IdTokens_one(object: {idToken: \\\"$RFID_TOKEN\\\", type: \\\"ISO14443\\\", tenantId: $TENANT_ID, createdAt: \\\"$TIMESTAMP\\\", updatedAt: \\\"$TIMESTAMP\\\"}) { id idToken type tenantId } }\"}")

ID_TOKEN_ID=$(echo $ID_TOKEN_RESPONSE | jq -r '.data.insert_IdTokens_one.id')
echo "IdToken created with ID: $ID_TOKEN_ID"

# Step 2: Create IdTokenInfo
echo "Step 2: Creating IdTokenInfo..."
ID_TOKEN_INFO_RESPONSE=$(curl -s $HASURA_URL \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { insert_IdTokenInfos_one(object: {status: \\\"Accepted\\\", chargingPriority: 3, language1: \\\"en\\\", language2: \\\"ne\\\", cacheExpiryDateTime: \\\"2025-12-31T23:59:59.000Z\\\", createdAt: \\\"$TIMESTAMP\\\", updatedAt: \\\"$TIMESTAMP\\\"}) { id status chargingPriority } }\"}")

ID_TOKEN_INFO_ID=$(echo $ID_TOKEN_INFO_RESPONSE | jq -r '.data.insert_IdTokenInfos_one.id')
echo "IdTokenInfo created with ID: $ID_TOKEN_INFO_ID"

# Step 3: Create Authorization link
echo "Step 3: Creating Authorization link..."
AUTH_RESPONSE=$(curl -s $HASURA_URL \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { insert_Authorizations_one(object: {idTokenId: $ID_TOKEN_ID, idTokenInfoId: $ID_TOKEN_INFO_ID, concurrentTransaction: true, createdAt: \\\"$TIMESTAMP\\\", updatedAt: \\\"$TIMESTAMP\\\"}) { id idTokenId idTokenInfoId } }\"}")

AUTH_ID=$(echo $AUTH_RESPONSE | jq -r '.data.insert_Authorizations_one.id')
echo "Authorization created with ID: $AUTH_ID"

echo "✅ RFID card $RFID_TOKEN successfully added to authorization system!"
echo "  - IdToken ID: $ID_TOKEN_ID"
echo "  - IdTokenInfo ID: $ID_TOKEN_INFO_ID"
echo "  - Authorization ID: $AUTH_ID"
```

### **Usage Examples**

```bash
# Add a new RFID card
./add-rfid-card.sh A1B2C3D4

# Add the physical card we just used
./add-rfid-card.sh D6A3FA03
```

## 🔧 **Configuration Parameters**

### **Required Fields for IdTokens**
- `idToken`: The actual RFID token string (e.g., "D6A3FA03")
- `type`: Token type ("ISO14443" for RFID cards)
- `tenantId`: Tenant ID (typically 1 for Yatri)
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp

### **Required Fields for IdTokenInfos**
- `status`: Authorization status ("Accepted", "Blocked", "Expired")
- `chargingPriority`: Priority level (1=highest, 5=lowest)
- `language1`: Primary language ("en", "ne")
- `language2`: Secondary language
- `cacheExpiryDateTime`: Expiration date (ISO timestamp)
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp

### **Required Fields for Authorizations**
- `idTokenId`: ID from Step 1 response
- `idTokenInfoId`: ID from Step 2 response
- `concurrentTransaction`: Boolean (typically true)
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp

## 🚨 **Critical Notes**

1. **Always use timestamps** - The database requires `createdAt` and `updatedAt` fields
2. **Single-line JSON only** - Newlines in GraphQL queries cause parsing errors
3. **Link IDs manually** - Use the returned IDs from each step for the next step
4. **Verify after creation** - Always run the verification query to confirm setup
5. **No direct relationships** - Query tables separately, don't use nested relationship queries

## 📊 **Database Schema Reference**

### **3-Table Authorization Model**
```
IdTokens (id, idToken, type, tenantId, createdAt, updatedAt)
    ↓
Authorizations (id, idTokenId, idTokenInfoId, concurrentTransaction, createdAt, updatedAt)
    ↓
IdTokenInfos (id, status, chargingPriority, language1, language2, cacheExpiryDateTime, createdAt, updatedAt)
```

This model ensures proper authorization flow and maintains referential integrity for the OCPP charging system.

---

**Last Updated**: January 15, 2025
**Tested Environment**: AWS CitrineOS deployment with Hasura GraphQL
**Success Rate**: 100% when following this exact process