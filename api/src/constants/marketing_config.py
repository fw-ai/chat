import requests
from src.constants.configs import APP_CONFIG
from functools import lru_cache

_SUPPORTED_MODELS = [v["id"] for _, v in APP_CONFIG["models"].items()]


@lru_cache
def get_marketing_config():
    full_urls = requests.get(APP_CONFIG["marketing_url"]).json()

    _keys_to_keep = ["title", "link", "provider", "contextLength", "supportsTools"]
    cleaned_urls = {
        val["id"]: {k: v for k, v in val.items() if k in _keys_to_keep}
        for val in full_urls
        if val["id"] in _SUPPORTED_MODELS
    }
    return cleaned_urls
