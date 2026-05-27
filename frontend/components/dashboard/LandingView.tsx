"use client";

import { useEffect, useRef } from "react";
import { FileText, FileAudio, Link as LinkIcon, Sparkles, Zap, Layers, Network, MessageSquare, RotateCcw, Clock } from "lucide-react";

export default function LandingView({ processor, fileInputRef, audioInputRef }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W: number, H: number;
    let stars: any[] = [], orbs: any[] = [];

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const initStars = () => {
      stars = Array.from({ length: 110 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random(),
        speed: Math.random() * 0.004 + 0.002,
        phase: Math.random() * Math.PI * 2
      }));
    };

    const initOrbs = () => {
      orbs = [
        { x: W * 0.12, y: H * 0.18, r: 280, color: 'rgba(245,166,35,0.055)' },
        { x: W * 0.85, y: H * 0.25, r: 260, color: 'rgba(34,200,122,0.045)' },
        { x: W * 0.5,  y: H * 0.88, r: 320, color: 'rgba(108,154,255,0.04)' },
      ];
    };

    let t = 0;
    let animId: number;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const grd = ctx.createRadialGradient(W/2, H*0.3, 0, W/2, H*0.3, H*0.9);
      grd.addColorStop(0, '#0e1620');
      grd.addColorStop(1, '#080d12');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      orbs.forEach(o => {
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, o.color);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      });

      stars.forEach(s => {
        const alpha = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#c8d8f0';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 0.025;
      ctx.strokeStyle = '#6b9abf';
      ctx.lineWidth = 0.5;
      const gs = 80;
      for (let x = 0; x < W; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      ctx.globalAlpha = 1;
      t++;
      animId = requestAnimationFrame(draw);
    };

    const handleResize = () => { resize(); initStars(); initOrbs(); };
    window.addEventListener('resize', handleResize);
    resize(); initStars(); initOrbs(); draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, mode: "pdf" | "audio") => {
    const file = e.target.files?.[0];
    if (file) {
      if (mode === "pdf") {
        processor.setPdfFile(file);
        processor.setInputMode("pdf");
        processor.processVideo({ overrideMode: "pdf", overrideFile: file });
      } else {
        processor.setAudioFile(file);
        processor.setInputMode("audio");
        processor.processVideo({ overrideMode: "audio", overrideFile: file });
      }
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
        
        .landing-wrapper {
          --amber:   #F5A623;
          --amber-dim: #c47d0e;
          --green:   #22c87a;
          --green-dark: #17a362;
          --bg:      #080d12;
          --surface: #0e1620;
          --surface2: #141f2e;
          --border:  rgba(255,255,255,0.07);
          --text:    #eef2f7;
          --muted:   #6b7f96;
          --font-head: 'Syne', sans-serif;
          --font-body: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          min-height: 100vh;
          overflow-x: hidden;
          position: relative;
        }

        .landing-wrapper #bg-canvas {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }

        .landing-wrapper nav {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 2.5rem;
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(20px);
          background: rgba(8,13,18,0.6);
        }

        .landing-wrapper .logo-wrap {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .landing-wrapper .logo-icon {
          width: 38px; height: 38px;
          background: linear-gradient(135deg, #f5a623 0%, #e07b0a 100%);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
          font-weight: 800;
          color: #fff;
          font-family: var(--font-head);
          flex-shrink: 0;
        }
        .landing-wrapper .logo-text { font-family: var(--font-head); font-size: 1.2rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
        .landing-wrapper .logo-sub  { font-size: 0.7rem; color: var(--muted); font-weight: 300; letter-spacing: 0.04em; margin-top: -2px; }

        .landing-wrapper .nav-right {
          display: flex; align-items: center; gap: 0.5rem;
        }
        .landing-wrapper .nav-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 0.45rem 1rem;
          border-radius: 8px;
          cursor: pointer;
          font-family: var(--font-body);
          font-size: 0.82rem;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
        }
        .landing-wrapper .nav-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.04); }
        .landing-wrapper .nav-btn-icon {
          background: transparent; border: 1px solid var(--border);
          color: var(--muted); padding: 0.45rem 0.6rem;
          border-radius: 8px; cursor: pointer; font-size: 1rem;
          transition: color 0.2s, border-color 0.2s;
        }
        .landing-wrapper .nav-btn-icon:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

        .landing-wrapper .hero {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 200px);
          padding: 4rem 1.5rem 5rem;
          text-align: center;
          width: 100%;
          max-width: 100vw;
          box-sizing: border-box;
          overflow-x: hidden;
        }

        .landing-wrapper .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(245,166,35,0.1);
          border: 1px solid rgba(245,166,35,0.25);
          color: var(--amber);
          border-radius: 100px;
          padding: 0.3rem 0.85rem;
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 2rem;
          animation: fadeUp 0.6s ease both;
        }
        .landing-wrapper .badge-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--amber);
          animation: pulse 2s ease infinite;
        }

        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .landing-wrapper .hero-headline {
          font-family: var(--font-head);
          font-size: clamp(2.6rem, 6vw, 5rem);
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -0.04em;
          max-width: 780px;
          margin-bottom: 1.4rem;
          animation: fadeUp 0.6s 0.1s ease both;
        }
        .landing-wrapper .headline-gradient {
          background: linear-gradient(90deg, var(--amber) 0%, #ffd166 60%, var(--green) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .landing-wrapper .hero-sub {
          max-width: 520px;
          color: var(--muted);
          font-size: 1.05rem;
          line-height: 1.7;
          font-weight: 300;
          margin-bottom: 2.8rem;
          animation: fadeUp 0.6s 0.2s ease both;
        }

        .landing-wrapper .input-zone {
          width: 100%;
          max-width: 660px;
          animation: fadeUp 0.6s 0.3s ease both;
        }

        .landing-wrapper .url-bar {
          display: flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 6px 6px 6px 1.1rem;
          gap: 0.5rem;
          transition: border-color 0.2s, box-shadow 0.2s;
          margin-bottom: 0.9rem;
        }
        .landing-wrapper .url-bar:focus-within {
          border-color: rgba(245,166,35,0.5);
          box-shadow: 0 0 0 3px rgba(245,166,35,0.08);
        }

        .landing-wrapper .url-bar-icon { font-size: 1rem; flex-shrink: 0; color: var(--muted); }

        .landing-wrapper .url-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: var(--font-body);
          font-size: 0.92rem;
          font-weight: 400;
          caret-color: var(--amber);
        }
        .landing-wrapper .url-input::placeholder { color: var(--muted); }

        .landing-wrapper .btn-group { display: flex; gap: 6px; flex-shrink: 0; }

        .landing-wrapper .btn-icon {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 9px;
          width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--muted); font-size: 1rem;
          transition: background 0.2s, color 0.2s;
        }
        .landing-wrapper .btn-icon:hover { background: rgba(255,255,255,0.06); color: var(--text); }

        .landing-wrapper .btn-process {
          background: var(--green);
          border: none;
          border-radius: 9px;
          padding: 0 1.2rem;
          height: 38px;
          font-family: var(--font-body);
          font-size: 0.88rem;
          font-weight: 500;
          color: #fff;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          letter-spacing: 0.01em;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .landing-wrapper .btn-process:hover { background: var(--green-dark); transform: translateY(-1px); }
        .landing-wrapper .btn-process:active { transform: translateY(0); }

        .landing-wrapper .input-pills {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .landing-wrapper .pill {
          display: flex; align-items: center; gap: 0.35rem;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 0.28rem 0.75rem;
          font-size: 0.72rem;
          color: var(--muted);
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .landing-wrapper .pill:hover { border-color: rgba(255,255,255,0.15); color: var(--text); }
        .landing-wrapper .pill-dot { width: 5px; height: 5px; border-radius: 50%; }

        .landing-wrapper .features {
          position: relative; z-index: 10;
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
          padding: 0 1.5rem 5rem;
          animation: fadeUp 0.6s 0.45s ease both;
        }
        .landing-wrapper .feat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.4rem 1.6rem;
          width: 200px;
          text-align: left;
          transition: border-color 0.25s, transform 0.25s;
        }
        .landing-wrapper .feat-card:hover { border-color: rgba(255,255,255,0.14); transform: translateY(-3px); }
        .landing-wrapper .feat-icon {
          font-size: 1.4rem;
          margin-bottom: 0.7rem;
          display: block;
        }
        .landing-wrapper .feat-title {
          font-family: var(--font-head);
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.35rem;
          letter-spacing: -0.01em;
        }
        .landing-wrapper .feat-desc {
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.55;
          font-weight: 300;
        }

        .landing-wrapper .ticker-wrap {
          position: relative; z-index: 10;
          overflow: hidden;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 0.7rem 0;
          margin-bottom: 0;
        }
        .landing-wrapper .ticker {
          display: flex;
          gap: 2.5rem;
          white-space: nowrap;
          animation: ticker 40s linear infinite;
        }
        .landing-wrapper .ticker-item {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--muted);
          font-weight: 300;
          letter-spacing: 0.03em;
        }
        .landing-wrapper .ticker-sep { color: rgba(255,255,255,0.15); }
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        /* Mobile Adjustments */
        @media (max-width: 768px) {
          .landing-wrapper {
            max-width: 100vw;
          }
          .landing-wrapper nav {
            padding: 1rem;
            overflow: hidden;
          }
          .landing-wrapper .logo-sub {
            display: none;
          }
          .landing-wrapper .nav-btn-text {
            display: none;
          }
          .landing-wrapper .nav-btn {
            padding: 0.45rem 0.6rem;
          }
          .landing-wrapper .hero {
            padding: 3rem 1rem 4rem;
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
          }
          .landing-wrapper .hero-headline {
            font-size: clamp(2rem, 8vw, 4rem);
            word-break: break-word;
            overflow-wrap: break-word;
          }
        }
      `}} />

      <div className="landing-wrapper">
        <canvas id="bg-canvas" ref={canvasRef}></canvas>

        {/* Hidden inputs to trigger actual file parsing tied to our main dashboard */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, "pdf")}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, "audio")}
        />

        <nav>
          <div className="logo-wrap">
            <div className="logo-icon">V</div>
            <div>
              <div className="logo-text">VidSage</div>
              <div className="logo-sub">AI Study Buddy for Videos</div>
            </div>
          </div>
          <div className="nav-right">
            <button className="nav-btn-icon" title="Import PDF" onClick={() => fileInputRef.current?.click()}><FileText size={18} /></button>
            <button className="nav-btn-icon" title="Upload Audio File" onClick={() => audioInputRef.current?.click()}><FileAudio size={18} /></button>
            <button className="nav-btn flex items-center gap-2" onClick={processor.resetSession} title="New Session">
              <RotateCcw size={16} />
              <span className="nav-btn-text">New Session</span>
            </button>
            <button className="nav-btn flex items-center gap-2" title="History">
              <Clock size={16} />
              <span className="nav-btn-text">History</span>
            </button>
          </div>
        </nav>

        <section className="hero">
          <div className="badge">
            <span className="badge-dot"></span>
            Powered by AI
          </div>

          <h1 className="hero-headline">
            Turn any video into<br />
            <span className="headline-gradient">structured knowledge</span>
          </h1>

          <p className="hero-sub">
            Paste a YouTube link, drop a PDF, or upload an audio file — VidSage maps your content into summaries, flashcards, and insights instantly.
          </p>

          <div className="input-zone">
            <div className="url-bar">
              <span className="url-bar-icon"><LinkIcon size={18} /></span>
              <input
                className="url-input"
                type="text"
                placeholder="Paste a YouTube URL and press Enter..."
                value={processor.videoUrl}
                onChange={(e) => {
                  processor.setVideoUrl(e.target.value);
                  processor.setInputMode("youtube");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && processor.videoUrl.trim()) {
                    processor.processVideo({});
                  }
                }}
              />
              <div className="btn-group">
              <button className="btn-icon" title="Upload PDF File" onClick={() => fileInputRef.current?.click()}><FileText size={18} /></button>
              <button className="btn-icon" title="Upload Audio File" onClick={() => audioInputRef.current?.click()}><FileAudio size={18} /></button>
                <button className="btn-process" onClick={() => processor.processVideo({})}>
                  <Sparkles size={16} /> Process
                </button>
              </div>
            </div>

            <div className="input-pills">
              <div className="pill" onClick={() => processor.setInputMode("youtube")}>
                <span className="pill-dot" style={{background: "#f5a623"}}></span>
                YouTube video
              </div>
              <div className="pill" onClick={() => fileInputRef.current?.click()}>
                <span className="pill-dot" style={{background: "#22c87a"}}></span>
                PDF document
              </div>
              <div className="pill" onClick={() => audioInputRef.current?.click()}>
                <span className="pill-dot" style={{background: "#6c9aff"}}></span>
                Audio file
              </div>
              <div className="pill">
                <span className="pill-dot" style={{background: "#c87adc"}}></span>
                Lecture recording
              </div>
            </div>
          </div>
        </section>

        <div className="features">
          <div className="feat-card">
            <span className="feat-icon"><Zap size={28} className="text-amber-400" /></span>
            <div className="feat-title">Instant Summary</div>
            <div className="feat-desc">Get the core ideas from any video in under 10 seconds.</div>
          </div>
          <div className="feat-card">
            <span className="feat-icon"><Layers size={28} className="text-emerald-400" /></span>
            <div className="feat-title">Smart Flashcards</div>
            <div className="feat-desc">Auto-generated Q&amp;A cards ready for spaced repetition.</div>
          </div>
          <div className="feat-card">
            <span className="feat-icon"><Network size={28} className="text-blue-400" /></span>
            <div className="feat-title">Knowledge Map</div>
            <div className="feat-desc">Visual mind maps that trace connections across topics.</div>
          </div>
          <div className="feat-card">
            <span className="feat-icon"><MessageSquare size={28} className="text-purple-400" /></span>
            <div className="feat-title">Ask Anything</div>
            <div className="feat-desc">Chat with your content — get answers with timestamps.</div>
          </div>
        </div>

        <div className="ticker-wrap">
          <div className="ticker">
            <span className="ticker-item">YouTube <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">PDF Docs <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">MP3 Lectures <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Auto Summaries <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Flashcards <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Mind Maps <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">AI Q&amp;A <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Timestamped Notes <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Study Guides <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">YouTube <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">PDF Docs <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">MP3 Lectures <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Auto Summaries <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Flashcards <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Mind Maps <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">AI Q&amp;A <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Timestamped Notes <span className="ticker-sep">✦</span></span>
            <span className="ticker-item">Study Guides</span>
          </div>
        </div>
      </div>
    </>
  );
}
