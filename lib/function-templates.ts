import type { FunctionDefinition } from "@/types/chat"

export interface FunctionTemplate {
  name: string
  description: string
  functions: FunctionDefinition[]
}

export const FUNCTION_TEMPLATES: FunctionTemplate[] = [
  {
    name: "customer_support",
    description: "Customer Support Tools",
    functions: [
      {
        name: "lookup_customer",
        description: "Look up customer information by email or ID",
        parameters: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "Customer email or customer ID"
            },
            include_history: {
              type: "boolean",
              description: "Include purchase/support history"
            }
          },
          required: ["identifier"]
        }
      },
      {
        name: "create_support_ticket",
        description: "Create a new support ticket",
        parameters: {
          type: "object",
          properties: {
            customer_id: {
              type: "string",
              description: "Customer identifier"
            },
            issue_type: {
              type: "string",
              description: "Type of issue",
              enum: ["billing", "technical", "account", "feature_request"]
            },
            priority: {
              type: "string",
              description: "Ticket priority",
              enum: ["low", "medium", "high", "urgent"]
            },
            description: {
              type: "string",
              description: "Detailed description of the issue"
            }
          },
          required: ["customer_id", "issue_type", "description"]
        }
      },
      {
        name: "update_ticket_status",
        description: "Update the status of an existing support ticket",
        parameters: {
          type: "object",
          properties: {
            ticket_id: {
              type: "string",
              description: "Ticket identifier"
            },
            status: {
              type: "string",
              description: "New ticket status",
              enum: ["open", "in_progress", "waiting_customer", "resolved", "closed"]
            },
            notes: {
              type: "string",
              description: "Optional notes about the status change"
            }
          },
          required: ["ticket_id", "status"]
        }
      }
    ]
  },
  {
    name: "knowledge_search",
    description: "Knowledge Base Search",
    functions: [
      {
        name: "search_documents",
        description: "Search through company knowledge base and documentation",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query"
            },
            filters: {
              type: "object",
              properties: {
                document_type: {
                  type: "string",
                  description: "Type of document",
                  enum: ["policy", "guide", "faq", "technical", "all"]
                },
                department: {
                  type: "string",
                  description: "Department filter"
                },
                date_range: {
                  type: "string",
                  description: "Filter by date range",
                  enum: ["last_week", "last_month", "last_year", "all_time"]
                }
              }
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_document",
        description: "Retrieve a specific document by ID",
        parameters: {
          type: "object",
          properties: {
            document_id: {
              type: "string",
              description: "Unique document identifier"
            },
            include_metadata: {
              type: "boolean",
              description: "Include document metadata"
            }
          },
          required: ["document_id"]
        }
      },
      {
        name: "semantic_search",
        description: "Perform semantic search across knowledge base",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Natural language search query"
            },
            similarity_threshold: {
              type: "number",
              description: "Minimum similarity score (0-1)"
            },
            collections: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Specific collections to search in"
            }
          },
          required: ["query"]
        }
      }
    ]
  },
  {
    name: "code_generation",
    description: "Code Generation Tools",
    functions: [
      {
        name: "list_files",
        description: "List files in a directory",
        parameters: {
          type: "object",
          properties: {
            directory_path: {
              type: "string",
              description: "Path to the directory"
            },
            pattern: {
              type: "string",
              description: "File pattern to match (e.g., '*.py', '*.js')"
            },
            recursive: {
              type: "boolean",
              description: "Search subdirectories recursively"
            }
          },
          required: ["directory_path"]
        }
      },
      {
        name: "read_file",
        description: "Read contents of a file",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path to the file"
            },
            encoding: {
              type: "string",
              description: "File encoding",
              enum: ["utf-8", "ascii", "latin-1"]
            }
          },
          required: ["file_path"]
        }
      },
      {
        name: "write_code",
        description: "Generate and write code to a file",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path where to write the file"
            },
            language: {
              type: "string",
              description: "Programming language",
              enum: ["python", "javascript", "typescript", "java", "go", "rust"]
            },
            code_type: {
              type: "string",
              description: "Type of code to generate",
              enum: ["function", "class", "module", "test", "script"]
            },
            description: {
              type: "string",
              description: "Description of what the code should do"
            }
          },
          required: ["file_path", "language", "description"]
        }
      }
    ]
  }
]

export const getDefaultFunctions = (): FunctionDefinition[] => {
  return FUNCTION_TEMPLATES[0].functions
}

export const getFunctionsByTemplate = (templateName: string): FunctionDefinition[] => {
  const template = FUNCTION_TEMPLATES.find(t => t.name === templateName)
  return template?.functions || []
}
