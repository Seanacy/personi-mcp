const { createClient } = require("@supabase/supabase-js");

// âââââââââââââââââââââââââââââââââââââââââââââââââââ
// PERSONI MCP SERVER
// Remote MCP connector for AI Character Management
// âââââââââââââââââââââââââââââââââââââââââââââââââââ

const SUPABASE_URL = process.env.SUPABASE_URL || "https://iqfxvjgqxxuejxloftmx.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// âââ TOOL DEFINITIONS ââââââââââââââââââââââââââââ

const TOOLS = [
  {
    name: "list_personas",
    description: "List all AI personas/characters for the authenticated user. Returns each persona's name, tagline, and ID.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_persona",
    description: "Get full details of a specific persona including name, tagline, personality selections, customizations, and compiled AI prompt.",
    inputSchema: {
      type: "object",
      properties: {
        persona_id: { type: "string", description: "The UUID of the persona to retrieve" }
      },
      required: ["persona_id"]
    }
  },
  {
    name: "create_persona",
    description: "Create a new AI persona/character. Define their name, tagline, personality traits, and custom AI prompt.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The persona's display name" },
        tagline: { type: "string", description: "A short tagline or description for this persona" },
        selections: {
          type: "object",
          description: "Personality trait selections (e.g., tone, style, audience, niche). JSON object with key-value pairs."
        },
        customizations: {
          type: "object",
          description: "Custom overrides and additional settings. JSON object with key-value pairs."
        },
        compiled_prompt: {
          type: "string",
          description: "The full compiled AI system prompt that defines this persona's behavior and voice."
        },
        chat_enabled: {
          type: "boolean",
          description: "Whether this persona can be chatted with publicly. Default: false."
        },
        chat_slug: {
          type: "string",
          description: "URL slug for the public chat page (must be unique). Only needed if chat_enabled is true."
        }
      },
      required: ["name"]
    }
  },
  {
    name: "update_persona",
    description: "Update an existing persona's details. Only provide the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        persona_id: { type: "string", description: "The UUID of the persona to update" },
        name: { type: "string", description: "Updated display name" },
        tagline: { type: "string", description: "Updated tagline" },
        selections: { type: "object", description: "Updated personality selections (replaces existing)" },
        customizations: { type: "object", description: "Updated customizations (replaces existing)" },
        compiled_prompt: { type: "string", description: "Updated compiled AI prompt" },
        chat_enabled: { type: "boolean", description: "Enable/disable public chat" },
        chat_slug: { type: "string", description: "Updated chat URL slug" }
      },
      required: ["persona_id"]
    }
  },
  {
    name: "delete_persona",
    description: "Permanently delete a persona and all its chat history. This cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        persona_id: { type: "string", description: "The UUID of the persona to delete" }
      },
      required: ["persona_id"]
    }
  },
  {
    name: "get_chat_history",
    description: "Get the chat message history for a specific persona. Returns messages in chronological order.",
    inputSchema: {
      type: "object",
      properties: {
        persona_id: { type: "string", description: "The UUID of the persona" },
        limit: { type: "number", description: "Max number of messages to return. Default: 50." }
      },
      required: ["persona_id"]
    }
  },
  {
    name: "get_profile",
    description: "Get the authenticated user's Personi profile including their plan tier and persona count.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// âââ SUPABASE CLIENT âââââââââââââââââââââââââââââ

function getSupabase(userToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    }
  });
}

// âââ TOOL HANDLERS âââââââââââââââââââââââââââââââ

async function handleTool(name, args, userToken) {
  const supabase = getSupabase(userToken);

  switch (name) {
    case "list_personas": {
      const { data, error } = await supabase
        .from("personas")
        .select("id, name, tagline, chat_enabled, chat_slug, messages_count, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { personas: data, count: data.length };
    }

    case "get_persona": {
      const { data, error } = await supabase
        .from("personas")
        .select("*")
        .eq("id", args.persona_id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case "create_persona": {
      // Get user ID from auth
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Authentication failed");

      const insert = {
        user_id: user.id,
        name: args.name,
        tagline: args.tagline || null,
        selections: args.selections || {},
        customizations: args.customizations || {},
        compiled_prompt: args.compiled_prompt || null,
        chat_enabled: args.chat_enabled || false,
        chat_slug: args.chat_slug || null,
      };

      const { data, error } = await supabase
        .from("personas")
        .insert(insert)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Update persona count
      await supabase.rpc("increment_persona_count", { user_uuid: user.id }).catch(() => {});

      return { message: "Persona created successfully", persona: data };
    }

    case "update_persona": {
      const updates = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.tagline !== undefined) updates.tagline = args.tagline;
      if (args.selections !== undefined) updates.selections = args.selections;
      if (args.customizations !== undefined) updates.customizations = args.customizations;
      if (args.compiled_prompt !== undefined) updates.compiled_prompt = args.compiled_prompt;
      if (args.chat_enabled !== undefined) updates.chat_enabled = args.chat_enabled;
      if (args.chat_slug !== undefined) updates.chat_slug = args.chat_slug;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("personas")
        .update(updates)
        .eq("id", args.persona_id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { message: "Persona updated successfully", persona: data };
    }

    case "delete_persona": {
      // Delete chat messages first
      await supabase
        .from("chat_messages")
        .delete()
        .eq("persona_id", args.persona_id);

      const { error } = await supabase
        .from("personas")
        .delete()
        .eq("id", args.persona_id);
      if (error) throw new Error(error.message);
      return { message: "Persona deleted successfully" };
    }

    case "get_chat_history": {
      const limit = args.limit || 50;
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("persona_id", args.persona_id)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { messages: data, count: data.length };
    }

    case "get_profile": {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Authentication failed");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// âââ MCP PROTOCOL HANDLER ââââââââââââââââââââââââ

function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg, userToken) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return makeResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "personi-mcp",
          version: "1.0.0",
          description: "Personi â AI Character Management. Create, manage, and deploy AI personas."
        }
      });

    case "notifications/initialized":
      return null; // No response needed

    case "tools/list":
      return makeResponse(id, { tools: TOOLS });

    case "tools/call": {
      const { name, arguments: args } = params;
      try {
        const result = await handleTool(name, args || {}, userToken);
        return makeResponse(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        });
      } catch (err) {
        return makeResponse(id, {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true
        });
      }
    }

    case "ping":
      return makeResponse(id, {});

    default:
      return makeError(id, -32601, `Method not found: ${method}`);
  }
}

// âââ VERCEL HANDLER ââââââââââââââââââââââââââââââ

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET = server info
  if (req.method === "GET") {
    return res.status(200).json({
      name: "personi-mcp",
      version: "1.0.0",
      description: "Personi â AI Character Management. Create, manage, and deploy AI personas.",
      tools: TOOLS.map(t => t.name),
      auth: "Bearer token required (Supabase JWT)"
    });
  }

  // POST = MCP messages
  if (req.method === "POST") {
    // Extract auth token
    const authHeader = req.headers.authorization || "";
    const userToken = authHeader.replace("Bearer ", "");

    if (!userToken && !SUPABASE_ANON_KEY) {
      return res.status(401).json(makeError(null, -32000, "Authorization required. Provide a Bearer token."));
    }

    const body = req.body;

    // Handle batch messages
    if (Array.isArray(body)) {
      const results = [];
      for (const msg of body) {
        const result = await handleMessage(msg, userToken);
        if (result) results.push(result);
      }
      return res.status(200).json(results);
    }

    // Handle single message
    const result = await handleMessage(body, userToken || SUPABASE_ANON_KEY);
    if (!result) return res.status(204).end();
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
