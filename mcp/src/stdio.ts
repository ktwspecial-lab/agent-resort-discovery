#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
await createServer({source: process.env.AGENT_RESORT_SOURCE ?? 'mcp_npm', isTest: process.env.AGENT_RESORT_TEST === 'true'}).connect(new StdioServerTransport());
