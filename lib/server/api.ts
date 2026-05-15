import { NextResponse } from 'next/server'

export type ApiEnvelope<T> = {
  data: T
}

export type ApiErrorEnvelope = {
  error: string
}

export function apiData<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiEnvelope<T>>({ data }, init)
}

export function apiError(message: string, status = 500) {
  return NextResponse.json<ApiErrorEnvelope>({ error: message }, { status })
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
