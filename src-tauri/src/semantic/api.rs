//! OpenAI-compatible embeddings API client

use serde::Deserialize;

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

/// Call an OpenAI-compatible embeddings endpoint and return the embedding vector.
pub fn fetch_embedding(
    text: &str,
    api_url: &str,
    api_key: &str,
    model: &str,
) -> Result<Vec<f32>, String> {
    let url = format!("{}/embeddings", api_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "input": text
    });

    let response_text = ureq::post(&url)
        .set("Authorization", &format!("Bearer {}", api_key))
        .set("Content-Type", "application/json")
        .send_string(&body.to_string())
        .map_err(|e| format!("Embedding API request failed: {}", e))?
        .into_string()
        .map_err(|e| format!("Failed to read API response: {}", e))?;

    let response: EmbeddingResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse embedding response: {}", e))?;

    response
        .data
        .into_iter()
        .next()
        .map(|d| d.embedding)
        .ok_or_else(|| "Empty response from embedding API".to_string())
}

/// Returns true if the API is sufficiently configured to make calls.
pub fn is_configured(api_url: &str, api_key: &str) -> bool {
    !api_key.is_empty() && !api_url.is_empty()
}
