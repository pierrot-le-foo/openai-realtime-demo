'use client';

// Enhanced WebRTC debugging utilities
export class WebRTCDebugger {
  private logDiv: HTMLElement | null = null;

  constructor() {
    this.createDebugPanel();
  }

  private createDebugPanel() {
    // Create a debug panel in the browser
    this.logDiv = document.createElement('div');
    this.logDiv.id = 'webrtc-debug';
    this.logDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 400px;
      max-height: 300px;
      background: #000;
      color: #0f0;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 5px;
      overflow-y: auto;
      z-index: 10000;
      display: none;
    `;
    document.body.appendChild(this.logDiv);

    // Add toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = 'Debug WebRTC';
    toggleBtn.style.cssText = `
      position: fixed;
      top: 10px;
      right: 420px;
      padding: 5px 10px;
      background: #007acc;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      z-index: 10001;
    `;
    toggleBtn.onclick = () => {
      const isVisible = this.logDiv!.style.display !== 'none';
      this.logDiv!.style.display = isVisible ? 'none' : 'block';
    };
    document.body.appendChild(toggleBtn);
  }

  log(message: string, data?: any) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    
    console.log(logMessage, data || '');
    
    if (this.logDiv) {
      const logEntry = document.createElement('div');
      logEntry.innerHTML = logMessage + (data ? ` | ${JSON.stringify(data, null, 2)}` : '');
      this.logDiv.appendChild(logEntry);
      this.logDiv.scrollTop = this.logDiv.scrollHeight;
    }
  }

  async testWebRTCCapabilities() {
    this.log('=== WebRTC Capability Test ===');
    
    // Test getUserMedia support
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.log('❌ getUserMedia not supported');
        return false;
      }
      this.log('✅ getUserMedia supported');
    } catch (error) {
      this.log('❌ Error checking getUserMedia', error);
      return false;
    }

    // Test RTCPeerConnection support
    try {
      if (!window.RTCPeerConnection) {
        this.log('❌ RTCPeerConnection not supported');
        return false;
      }
      this.log('✅ RTCPeerConnection supported');
    } catch (error) {
      this.log('❌ Error checking RTCPeerConnection', error);
      return false;
    }

    // Test microphone access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.log('✅ Microphone access granted');
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      this.log('❌ Microphone access denied', error);
      return false;
    }

    // Test STUN server connectivity
    try {
      await this.testSTUNConnectivity();
    } catch (error) {
      this.log('❌ STUN server test failed', error);
    }

    return true;
  }

  private async testSTUNConnectivity(): Promise<void> {
    return new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      let candidateFound = false;
      const timeout = setTimeout(() => {
        if (!candidateFound) {
          this.log('❌ No ICE candidates found (STUN test failed)');
          pc.close();
          reject(new Error('STUN test timeout'));
        }
      }, 10000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidateFound = true;
          this.log('✅ ICE candidate found', event.candidate.candidate);
          clearTimeout(timeout);
          pc.close();
          resolve();
        }
      };

      pc.onicegatheringstatechange = () => {
        this.log(`ICE gathering state: ${pc.iceGatheringState}`);
      };

      // Create a dummy data channel to trigger ICE gathering
      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });
  }

  monitorPeerConnection(pc: RTCPeerConnection, label = 'Main') {
    this.log(`=== Monitoring PeerConnection: ${label} ===`);

    pc.onconnectionstatechange = () => {
      this.log(`${label} - Connection state: ${pc.connectionState}`);
    };

    pc.oniceconnectionstatechange = () => {
      this.log(`${label} - ICE connection state: ${pc.iceConnectionState}`);
    };

    pc.onicegatheringstatechange = () => {
      this.log(`${label} - ICE gathering state: ${pc.iceGatheringState}`);
    };

    pc.onsignalingstatechange = () => {
      this.log(`${label} - Signaling state: ${pc.signalingState}`);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.log(`${label} - ICE candidate:`, event.candidate.candidate);
      } else {
        this.log(`${label} - ICE gathering complete`);
      }
    };

    pc.onicecandidateerror = (event) => {
      this.log(`${label} - ICE candidate error:`, event);
    };

    pc.ontrack = (event) => {
      this.log(`${label} - Track received:`, event.track.kind);
    };

    pc.ondatachannel = (event) => {
      this.log(`${label} - Data channel received:`, event.channel.label);
      this.monitorDataChannel(event.channel, label);
    };
  }

  monitorDataChannel(dc: RTCDataChannel, parentLabel = '') {
    const label = `${parentLabel} DataChannel`;
    
    dc.onopen = () => {
      this.log(`${label} - Opened`);
    };

    dc.onclose = () => {
      this.log(`${label} - Closed`);
    };

    dc.onerror = (error) => {
      this.log(`${label} - Error:`, error);
    };

    dc.onmessage = (event) => {
      this.log(`${label} - Message received`, event.data.substring(0, 100));
    };
  }

  async testServerConnection() {
    this.log('=== Testing Server Connection ===');
    
    try {
      // Test basic server connectivity
      const response = await fetch('/api/session', {
        method: 'HEAD',
      });
      
      if (response.ok) {
        this.log('✅ Server reachable');
      } else {
        this.log(`❌ Server returned ${response.status}`);
      }
    } catch (error) {
      this.log('❌ Server connection failed', error);
    }

    // Test with a more realistic SDP that should work with OpenAI
    try {
      const testSdp = `v=0
o=- 123456789 987654321 IN IP4 127.0.0.1
s=-
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:test123456789012345678901234
a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00
a=setup:actpass
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=rtpmap:103 ISAC/16000
a=rtpmap:104 PCMU/8000
a=rtpmap:9 G722/8000
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=fmtp:111 minptime=10;useinbandfec=1
`;

      this.log('Testing session endpoint with realistic SDP...');
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: testSdp,
      });

      if (response.ok) {
        this.log('✅ Session endpoint responded successfully');
        const responseText = await response.text();
        this.log('Response SDP length:', responseText.length);
      } else {
        const errorText = await response.text();
        this.log(`❌ Session endpoint error: ${response.status}`, errorText);
      }
    } catch (error) {
      this.log('❌ Session endpoint test failed', error);
    }
  }

  analyzeSDPOffer(sdp: string) {
    this.log('=== SDP Analysis ===');
    this.log('SDP length:', sdp.length);
    
    const lines = sdp.split('\r\n');
    const audioLines = lines.filter(line => 
      line.startsWith('m=audio') || 
      line.startsWith('a=rtpmap:') ||
      line.startsWith('a=fmtp:') ||
      line.includes('audio')
    );
    
    this.log('Audio-related SDP lines:');
    audioLines.forEach(line => this.log('  ' + line));
    
    // Check for common codecs
    const hasOpus = sdp.includes('opus');
    const hasPCMU = sdp.includes('PCMU');
    const hasPCMA = sdp.includes('PCMA');
    const hasG722 = sdp.includes('G722');
    
    this.log('Codec support:');
    this.log(`  Opus: ${hasOpus ? '✅' : '❌'}`);
    this.log(`  PCMU (G.711): ${hasPCMU ? '✅' : '❌'}`);
    this.log(`  PCMA (G.711): ${hasPCMA ? '✅' : '❌'}`);
    this.log(`  G.722: ${hasG722 ? '✅' : '❌'}`);
  }
}

// Create global debugger instance
let webrtcDebugger: WebRTCDebugger | null = null;

export function createDebugger(): WebRTCDebugger {
  if (!webrtcDebugger) {
    webrtcDebugger = new WebRTCDebugger();
  }
  return webrtcDebugger;
}

export function getDebugger(): WebRTCDebugger | null {
  return webrtcDebugger;
}