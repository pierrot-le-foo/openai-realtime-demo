import { NextRequest } from 'next/server';

const sessionConfig = JSON.stringify({
  model: "gpt-4o-realtime-preview-2024-10-01",
  voice: "alloy"
});

// An endpoint which creates a Realtime API session using the unified interface
export async function POST(req: NextRequest) {
  try {
    // Get the SDP data from the request body
    const sdp = await req.text();
    
    if (!sdp) {
      return new Response('SDP data is required', { status: 400 });
    }

    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return new Response('OpenAI API key not configured', { status: 500 });
    }

    // Create form data with SDP and session config
    const formData = new FormData();
    formData.set("sdp", sdp);
    formData.set("session", sessionConfig);

    console.log('Sending to OpenAI API:');
    console.log('SDP length:', sdp.length);
    console.log('Session config:', sessionConfig);

    // Make request to OpenAI Realtime API
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      
      // Try to parse the error for more details
      try {
        const errorObj = JSON.parse(errorText);
        console.error('Parsed error:', errorObj);
        return new Response(JSON.stringify({
          error: 'OpenAI API Error',
          status: response.status,
          details: errorObj
        }), { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({
          error: 'OpenAI API Error',
          status: response.status,
          details: errorText
        }), { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Send back the SDP we received from the OpenAI REST API
    const responseSdp = await response.text();
    return new Response(responseSdp, {
      headers: {
        'Content-Type': 'application/sdp',
      },
    });
  } catch (error) {
    console.error("Session creation error:", error);
    return new Response('Failed to create session', { status: 500 });
  }
}