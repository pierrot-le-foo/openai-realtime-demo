// OpenAI Realtime API WebRTC compatibility utilities

/**
 * Create a compatible RTCPeerConnection configuration for OpenAI Realtime API
 */
export function createOpenAICompatiblePeerConnection(): RTCPeerConnection {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  });

  return pc;
}

/**
 * Configure audio transceiver for OpenAI compatibility
 */
export function configureAudioTransceiverForOpenAI(pc: RTCPeerConnection): RTCRtpTransceiver {
  // Create transceiver with specific direction
  const transceiver = pc.addTransceiver('audio', {
    direction: 'sendrecv',
  });

  // Try to set codec preferences if supported
  try {
    const capabilities = RTCRtpSender.getCapabilities('audio');
    if (capabilities?.codecs) {
      // Filter for codecs that OpenAI typically supports
      // Based on WebRTC standards, OpenAI usually supports:
      // - Opus (most common)
      // - PCMU/PCMA (G.711)
      // - G.722
      const supportedCodecs = capabilities.codecs.filter(codec => {
        const mimeType = codec.mimeType.toLowerCase();
        return (
          mimeType.includes('opus') ||
          mimeType.includes('pcmu') ||
          mimeType.includes('pcma') ||
          mimeType.includes('g722')
        );
      });

      if (supportedCodecs.length > 0) {
        transceiver.setCodecPreferences(supportedCodecs);
      }
    }
  } catch (error) {
    console.warn('Could not set codec preferences:', error);
  }

  return transceiver;
}

/**
 * Create SDP offer with OpenAI-compatible parameters
 */
export async function createOpenAICompatibleOffer(
  pc: RTCPeerConnection
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
    iceRestart: false,
  });

  if (!offer.sdp) {
    throw new Error('Failed to create SDP offer');
  }

  // Modify SDP to ensure compatibility
  const modifiedSdp = ensureCompatibleAudioSection(offer.sdp);
  
  return {
    type: offer.type,
    sdp: modifiedSdp,
  };
}

/**
 * Ensure the audio section of SDP is compatible with OpenAI
 */
function ensureCompatibleAudioSection(sdp: string): string {
  const lines = sdp.split('\r\n');
  const result: string[] = [];
  let inAudioSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('m=audio')) {
      inAudioSection = true;
      result.push(line);
    } else if (line.startsWith('m=') && !line.startsWith('m=audio')) {
      inAudioSection = false;
      result.push(line);
    } else if (inAudioSection) {
      // Process audio section lines
      if (line.startsWith('a=sendonly') || line.startsWith('a=recvonly')) {
        // Ensure bidirectional audio
        result.push('a=sendrecv');
      } else if (line.startsWith('a=rtcp-mux')) {
        // Ensure RTCP mux is enabled
        result.push(line);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\r\n');
}

/**
 * Validate SDP for OpenAI compatibility
 */
export function validateSDPForOpenAI(sdp: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check for audio media section
  if (!sdp.includes('m=audio')) {
    issues.push('Missing audio media section');
    suggestions.push('Ensure audio transceiver is added before creating offer');
  }

  // Check for sendrecv direction
  if (!sdp.includes('a=sendrecv')) {
    if (sdp.includes('a=sendonly') || sdp.includes('a=recvonly')) {
      issues.push('Audio direction is not bidirectional');
      suggestions.push('Set audio transceiver direction to "sendrecv"');
    }
  }

  // Check for supported codecs
  const hasOpus = sdp.includes('opus');
  const hasPCMU = sdp.includes('PCMU');
  const hasPCMA = sdp.includes('PCMA');
  
  if (!hasOpus && !hasPCMU && !hasPCMA) {
    issues.push('No commonly supported audio codecs found');
    suggestions.push('Ensure browser supports Opus, PCMU, or PCMA codecs');
  }

  // Check for proper connection information
  if (!sdp.includes('c=IN IP4')) {
    issues.push('Missing connection information');
    suggestions.push('Ensure proper network configuration');
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  };
}