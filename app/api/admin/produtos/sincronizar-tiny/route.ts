import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OlistOAuthError,
  getOlistV3,
  redisDelete,
  redisGetJson,
  redisSetJson,
  redisSetNx,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const SYNC_LOCK_KEY = "jkfashion:olist:v3:sync:lock";

// v22:
// - nova interpretação das grades
// - qualquer grade diferente de tamanho => cor
// - nome do próprio produto não entra como cor
// - grava também os IDs reais das variações em tinyVariacoes
const TINY_CATALOG_CACHE_KEY =
  "jkfashion:olist:v3:catalog:canonical:v22";

const TINY_CATALOG_CACHE_TTL =
  6 * 60 * 60;

const SITE_TINY_MAP_PREFIX =
  "jkfashion:olist:v3:site-tiny:";

// Janela usada apenas para descobrir produtos novos no modo rápido.
// Não controla a atualização de estoque dos produtos já cadastrados.
const QUICK_NEW_LOOKBACK_MS =
  30 * 24 * 60 * 60 * 1000;

const API_READ_BATCH_SIZE = 4;
const DETAIL_CONCURRENCY = 2;
const STOCK_CONFIRM_MAX_RETRIES = 1;
const FULL_BATCH_SIZE = 28;
const PLACEHOLDER_IMAGE = "";

type AnyRecord =
  Record<string, any>;

type TinyListItem = {
  id?: number | string;

  sku?: string | null;

  codigo?: string | null;

  descricao?: string | null;

  tipo?: string | null;

  situacao?: string | null;

  dataCriacao?: string | null;

  dataAlteracao?: string | null;

  tipoVariacao?: string | null;

  produtoPai?: {
    id?: number | string | null;
  } | null;

  grade?: TinyGrade;
};

type TinyGrade =
  | Array<{
      chave?: string | null;
      valor?: string | null;
    }>
  | Record<string, unknown>
  | null
  | undefined;

type TinyVariation = {
  id?: number | string;

  descricao?: string | null;

  sku?: string | null;

  gtin?: string | null;

  nome?: string | null;

  titulo?: string | null;

  estoque?: {
    quantidade?: number | null;
  } | null;
