import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

interface ServiceStatus {
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkPostgres(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET() {
  const [redisStatus, postgresStatus] = await Promise.all([
    checkRedis(),
    checkPostgres(),
  ]);

  const allHealthy =
    redisStatus.status === "up" && postgresStatus.status === "up";

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: redisStatus,
        postgres: postgresStatus,
      },
    },
    { status: allHealthy ? 200 : 503 },
  );
}
