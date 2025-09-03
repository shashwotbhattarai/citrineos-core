# Cleanup Queries for Tenant Separation

## Check for Charging Stations in Tenant ID 1

```graphql
query {
  ChargingStations(where: { tenantId: { _eq: 1 } }) {
    id
    tenantId
    isOnline
    protocol
  }
}
```

## Delete Charging Station from Tenant ID 1 (if exists)

```graphql
mutation {
  delete_ChargingStations(where: { id: { _eq: "yatri-ac-hw-001" }, tenantId: { _eq: 1 } }) {
    affected_rows
    returning {
      id
      tenantId
    }
  }
}
```

## Verify Charging Station is in Tenant ID 2

```graphql
query {
  ChargingStations(where: { id: { _eq: "yatri-ac-hw-001" } }) {
    id
    tenantId
    isOnline
    protocol
    location {
      id
      name
      tenantId
    }
  }
}
```

## Check All Data Under Tenant ID 1

```graphql
query {
  tenantData: (
    chargingStations: ChargingStations(where: { tenantId: { _eq: 1 } }) {
      id
      tenantId
    }
    locations: Locations(where: { tenantId: { _eq: 1 } }) {
      id
      name
      tenantId
    }
    idTokens: IdTokens(where: { tenantId: { _eq: 1 } }) {
      idToken
      tenantId
    }
  )
}
```