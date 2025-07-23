import type { FunctionDefinition } from "@/types/chat"

export interface FunctionTemplate {
  name: string
  description: string
  functions: FunctionDefinition[]
}

export const FUNCTION_TEMPLATES: FunctionTemplate[] = [
  {
    name: "weather_travel",
    description: "Weather & Travel Tools",
    functions: [
      {
        name: "get_weather",
        description: "Get current weather information for a specific location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name or location (e.g., 'San Francisco, CA')"
            },
            units: {
              type: "string",
              description: "Temperature units",
              enum: ["celsius", "fahrenheit"]
            }
          },
          required: ["location"]
        }
      },
      {
        name: "get_flight_info",
        description: "Get flight information between two locations",
        parameters: {
          type: "object",
          properties: {
            departure: {
              type: "string",
              description: "Departure city or airport code"
            },
            arrival: {
              type: "string",
              description: "Arrival city or airport code"
            },
            date: {
              type: "string",
              description: "Departure date (YYYY-MM-DD format)"
            }
          },
          required: ["departure", "arrival", "date"]
        }
      }
    ]
  },
  {
    name: "ecommerce",
    description: "E-commerce Tools",
    functions: [
      {
        name: "search_products",
        description: "Search for products in the catalog",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for products"
            },
            category: {
              type: "string",
              description: "Product category to filter by",
              enum: ["electronics", "clothing", "home", "books", "sports"]
            },
            max_price: {
              type: "number",
              description: "Maximum price filter"
            },
            min_rating: {
              type: "number",
              description: "Minimum rating filter (1-5)"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_product_details",
        description: "Get detailed information about a specific product",
        parameters: {
          type: "object",
          properties: {
            product_id: {
              type: "string",
              description: "Unique product identifier"
            }
          },
          required: ["product_id"]
        }
      },
      {
        name: "add_to_cart",
        description: "Add a product to the shopping cart",
        parameters: {
          type: "object",
          properties: {
            product_id: {
              type: "string",
              description: "Product identifier"
            },
            quantity: {
              type: "number",
              description: "Quantity to add to cart"
            }
          },
          required: ["product_id", "quantity"]
        }
      }
    ]
  },
  {
    name: "data_analysis",
    description: "Data Analysis Tools",
    functions: [
      {
        name: "analyze_dataset",
        description: "Perform statistical analysis on a dataset",
        parameters: {
          type: "object",
          properties: {
            dataset_name: {
              type: "string",
              description: "Name of the dataset to analyze"
            },
            analysis_type: {
              type: "string",
              description: "Type of analysis to perform",
              enum: ["summary", "correlation", "regression", "clustering"]
            },
            columns: {
              type: "string",
              description: "Comma-separated list of columns to analyze"
            }
          },
          required: ["dataset_name", "analysis_type"]
        }
      },
      {
        name: "create_visualization",
        description: "Create a data visualization",
        parameters: {
          type: "object",
          properties: {
            dataset_name: {
              type: "string",
              description: "Dataset to visualize"
            },
            chart_type: {
              type: "string",
              description: "Type of chart to create",
              enum: ["bar", "line", "scatter", "histogram", "pie"]
            },
            x_axis: {
              type: "string",
              description: "Column for x-axis"
            },
            y_axis: {
              type: "string",
              description: "Column for y-axis"
            }
          },
          required: ["dataset_name", "chart_type"]
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
