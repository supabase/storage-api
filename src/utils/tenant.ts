import pLimit from 'p-limit'
import { runMigrationsOnTenant } from './migrate'
import { pool } from './multitenant-db'

interface TenantConfig {
  anonKey: string
  databaseUrl: string
  jwtSecret: string
  serviceKey: string
}

const tenantConfigCache = new Map<string, TenantConfig>()

export async function cacheTenantConfigAndRunMigrations(
  tenantId: string,
  config: TenantConfig
): Promise<void> {
  await runMigrationsOnTenant(config.databaseUrl)
  tenantConfigCache.set(tenantId, config)
}

export function deleteTenantConfig(tenantId: string): void {
  tenantConfigCache.delete(tenantId)
}

export async function cacheTenantConfigsFromDbAndRunMigrations(): Promise<void> {
  const result = await pool.query(
    `
    SELECT
      id,
      config
    FROM
      tenants
    `
  )
  const limit = pLimit(100)
  await Promise.all(
    result.rows.map(({ id, config }) => limit(() => cacheTenantConfigAndRunMigrations(id, config)))
  )
}

async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
  if (tenantConfigCache.has(tenantId)) {
    return tenantConfigCache.get(tenantId) as TenantConfig
  }
  const result = await pool.query(
    `
    SELECT
      config
    FROM
      tenants
    WHERE
      id = $1
    `,
    [tenantId]
  )
  if (result.rows.length === 0) {
    throw new Error(`Tenant config for ${tenantId} not found`)
  }
  const { config } = result.rows[0]
  await cacheTenantConfigAndRunMigrations(tenantId, config)
  return config
}

export async function getAnonKey(tenantId: string): Promise<string> {
  const { anonKey } = await getTenantConfig(tenantId)
  return anonKey
}

export async function getServiceKey(tenantId: string): Promise<string> {
  const { serviceKey } = await getTenantConfig(tenantId)
  return serviceKey
}

export async function getJwtSecret(tenantId: string): Promise<string> {
  const { jwtSecret } = await getTenantConfig(tenantId)
  return jwtSecret
}