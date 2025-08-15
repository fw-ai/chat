from typing import List, Dict, Any, Optional
from src.constants.configs import PROMPT_LIBRARY


def add_user_request_to_prompt(user_request: str) -> str:
    return PROMPT_LIBRARY["default_prompt"].replace("{{user_request}}", user_request)


def format_functions_for_prompt(functions: List[Dict[str, Any]]) -> str:
    """Format function definitions into a readable prompt format."""
    if not functions:
        return "No functions available."

    formatted_functions = []

    for func in functions:
        func_name = func.get("name", "unknown")
        func_desc = func.get("description", "No description provided")

        # Format parameters
        params = func.get("parameters", {})
        properties = params.get("properties", {})
        required = params.get("required", [])

        param_descriptions = []
        for param_name, param_info in properties.items():
            param_type = param_info.get("type", "string")
            param_desc = param_info.get("description", "")
            is_required = param_name in required

            param_line = f"  - **{param_name}** ({param_type})"
            if param_desc:
                param_line += f": {param_desc}"
            if is_required:
                param_line += " [REQUIRED]"
            if param_info.get("enum"):
                param_line += f" (options: {', '.join(param_info['enum'])})"

            param_descriptions.append(param_line)

        func_format = f"### {func_name}\n{func_desc}"
        if param_descriptions:
            func_format += "\n\n**Parameters:**\n" + "\n".join(param_descriptions)

        formatted_functions.append(func_format)

    return "\n\n".join(formatted_functions)


def add_function_calling_to_prompt(
    user_request: str, functions: Optional[List[Dict[str, Any]]] = None
) -> str:
    """Create prompt with function calling support."""
    if not functions:
        return add_user_request_to_prompt(user_request)

    formatted_functions = format_functions_for_prompt(functions)
    prompt_template = PROMPT_LIBRARY["function_calling_prompt"]

    # Replace template variables
    prompt = prompt_template.replace("{{functions}}", formatted_functions)
    prompt = prompt.replace("{{user_request}}", user_request)

    return prompt
