#!/usr/bin/env node
/**
 * Script para exportar páginas do webinar "carlos" como HTML estático
 * para hospedar no WordPress ou outra plataforma
 */

import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000';
const OUTPUT_DIR = './dist/carlos';

async function fetchWebinarData() {
  console.log('Buscando dados do webinar carlos...');
  const res = await fetch(`${API_BASE}/api/webinars/carlos`);
  if (!res.ok) throw new Error('Webinar não encontrado');
  return res.json();
}

function generateTransmissaoHTML(webinar) {
  const bgColor = webinar.pageBackgroundColor || webinar.backgroundColor || '#1a1a2e';
  const playerColor = webinar.liveButtonColor || '#e91e63';
  const offerButtonColor = webinar.offerButtonColor || '#22c55e';
  const offerButtonTextColor = webinar.offerButtonTextColor || '#ffffff';
  
  const benefits = webinar.offerBenefits ? JSON.parse(webinar.offerBenefits) : [];
  
  // Título da página - usa seoPageTitle se disponível, senão pageTitle
  const pageTitle = webinar.seoPageTitle || webinar.pageTitle || webinar.name;
  // Usa Bíblia+ como siteName se não configurado ou se for igual ao título
  let siteName = webinar.seoSiteName;
  if (!siteName || siteName === webinar.pageTitle || siteName === webinar.seoPageTitle) {
    siteName = 'Bíblia+';
  }
  const fullTitle = `${pageTitle} | ${siteName}`;
  
  // Favicon - usa o configurado ou o padrão do Bíblia+
  const faviconUrl = webinar.seoFaviconUrl || 'https://erodfrfuuhxdaeqfjzsn.supabase.co/storage/v1/object/public/webinar-images/system/autowebinar-favicon.png';
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  <meta name="description" content="${webinar.seoDescription || webinar.description || ''}">
  <link rel="icon" href="${faviconUrl}">
  <link rel="apple-touch-icon" href="${faviconUrl}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background-color: ${bgColor};
      min-height: 100vh;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 12px 12px 48px; }
    @media (min-width: 768px) { .container { padding: 64px 16px; } }
    
    .header { text-align: center; margin-bottom: 16px; }
    @media (min-width: 768px) { .header { margin-bottom: 40px; } }
    
    .header-box {
      display: inline-block;
      padding: 24px 32px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%);
      backdrop-filter: blur(15px);
      border: 3px solid rgba(255, 215, 0, 0.4);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2);
    }
    @media (min-width: 768px) { .header-box { padding: 32px 48px; } }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      margin-bottom: 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      background: linear-gradient(90deg, #FFD700 0%, #FFA500 100%);
      color: #000000;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.5);
    }
    @media (min-width: 768px) { .badge { font-size: 14px; } }
    
    .title {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.1;
      background: linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8));
    }
    @media (min-width: 768px) { .title { font-size: 48px; } }
    @media (min-width: 1024px) { .title { font-size: 60px; } }
    
    .video-container {
      width: 100%;
      margin-bottom: 16px;
      border-radius: 12px;
      overflow: hidden;
      border: 4px solid white;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    @media (min-width: 768px) { .video-container { margin-bottom: 48px; } }
    
    .video-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      background: #1a1a2e;
    }
    
    .video-wrapper iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    
    .offer-section {
      text-align: center;
      padding: 40px 24px;
      border-radius: 16px;
      max-width: 900px;
      margin: 0 auto;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%);
      backdrop-filter: blur(10px);
      border: 2px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }
    @media (min-width: 768px) { .offer-section { padding: 64px 48px; } }
    
    .offer-badge {
      display: inline-block;
      padding: 8px 16px;
      margin-bottom: 24px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      background-color: #FFD700;
      color: #2c3e50;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
    }
    
    .offer-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 16px;
      color: ${webinar.offerTitleColor || '#ffffff'};
      text-shadow: 3px 3px 6px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .offer-title { font-size: 32px; } }
    
    .offer-subtitle {
      font-size: 16px;
      margin-bottom: 24px;
      font-weight: 500;
      color: ${webinar.offerSubtitleColor || '#ffffff'};
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .offer-subtitle { font-size: 18px; } }
    
    .offer-image {
      max-width: 280px;
      margin: 0 auto 40px;
      display: block;
      border-radius: 8px;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
    }
    
    .benefits-box {
      margin-bottom: 40px;
      text-align: left;
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
      padding: 24px;
      border-radius: 12px;
      background-color: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .benefit-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .benefit-item:last-child { margin-bottom: 0; }
    
    .benefit-check {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: #90EE90;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .benefit-check svg {
      width: 16px;
      height: 16px;
      stroke: #000;
      stroke-width: 4;
    }
    
    .benefit-text {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .benefit-text { font-size: 18px; } }
    
    .price-box {
      padding: 32px;
      margin-bottom: 40px;
      border-radius: 12px;
      text-align: center;
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 100%);
      border: 3px solid ${webinar.offerPriceBorderColor || 'rgba(255, 215, 0, 0.8)'};
      box-shadow: 0 15px 40px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
    }
    
    .price-text {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.6;
      color: #ffffff;
      text-shadow: 2px 2px 6px rgba(0,0,0,0.9);
    }
    @media (min-width: 768px) { .price-text { font-size: 24px; } }
    
    .price-highlight {
      color: ${webinar.offerPriceHighlightColor || '#FFD700'};
      text-shadow: 2px 2px 8px rgba(0,0,0,1), 0 0 20px rgba(255,215,0,0.6);
      font-size: 1.2em;
    }
    
    .cta-button {
      display: block;
      width: 100%;
      padding: 24px 48px;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${offerButtonTextColor};
      background: linear-gradient(135deg, ${offerButtonColor} 0%, ${offerButtonColor}dd 100%);
      border: 4px solid rgba(255, 255, 255, 0.5);
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      box-shadow: 0 15px 40px ${offerButtonColor}99, inset 0 2px 0 rgba(255,255,255,0.3);
      text-shadow: 2px 2px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5);
      transition: transform 0.3s ease;
    }
    @media (min-width: 768px) { .cta-button { font-size: 24px; padding: 32px 48px; } }
    .cta-button:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    ${webinar.pageBadgeText || webinar.pageTitle ? `
    <div class="header">
      <div class="header-box">
        ${webinar.pageBadgeText ? `<div class="badge">${webinar.pageBadgeText}</div>` : ''}
        ${webinar.pageTitle ? `<h1 class="title">${webinar.pageTitle}</h1>` : ''}
      </div>
    </div>
    ` : ''}
    
    <div class="video-container">
      <div class="video-wrapper">
        <iframe 
          src="https://autowebinar-znc5.onrender.com/w/${webinar.slug}?embed=1"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </div>
    
    ${webinar.offerEnabled ? `
    <div class="offer-section">
      ${webinar.offerBadgeText ? `<div class="offer-badge">${webinar.offerBadgeText}</div>` : ''}
      ${webinar.offerTitle ? `<h2 class="offer-title">${webinar.offerTitle}</h2>` : ''}
      ${webinar.offerSubtitle ? `<p class="offer-subtitle">${webinar.offerSubtitle}</p>` : ''}
      ${webinar.offerImageUrl ? `<img src="${webinar.offerImageUrl}" alt="Oferta" class="offer-image">` : ''}
      
      ${benefits.length > 0 ? `
      <div class="benefits-box">
        ${benefits.map(b => `
        <div class="benefit-item">
          <div class="benefit-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <span class="benefit-text">${b}</span>
        </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${webinar.offerPriceText ? `
      <div class="price-box">
        <p class="price-text">${webinar.offerPriceText}</p>
      </div>
      ` : ''}
      
      ${webinar.offerButtonUrl && webinar.offerButtonText ? `
      <a href="${webinar.offerButtonUrl}" target="_blank" rel="noopener noreferrer" class="cta-button">
        ${webinar.offerButtonText}
      </a>
      ` : ''}
    </div>
    ` : ''}
  </div>
</body>
</html>`;
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

function generateReplayHTML(webinar) {
  const bgColor = webinar.replayBackgroundColor || '#4A8BB5';
  const playerColor = webinar.replayPlayerColor || '#3b82f6';
  const playerBorderColor = webinar.replayPlayerBorderColor || '#ffffff';
  const buttonColor = webinar.replayButtonColor || '#22c55e';
  
  const benefits = webinar.replayBenefits ? JSON.parse(webinar.replayBenefits) : [];
  
  // Título da página - remove HTML se houver
  const replayTitleClean = stripHtml(webinar.replayTitle) || webinar.pageTitle || webinar.name;
  // Usa Bíblia+ como siteName se não configurado ou se for igual ao título
  let siteName = webinar.seoSiteName;
  if (!siteName || siteName === webinar.pageTitle || siteName === webinar.seoPageTitle || siteName === replayTitleClean) {
    siteName = 'Bíblia+';
  }
  const fullTitle = `Replay: ${replayTitleClean} | ${siteName}`;
  
  // Favicon - usa o configurado ou o padrão do Bíblia+
  const faviconUrl = webinar.seoFaviconUrl || 'https://erodfrfuuhxdaeqfjzsn.supabase.co/storage/v1/object/public/webinar-images/system/autowebinar-favicon.png';
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  <meta name="description" content="${webinar.seoDescription || webinar.description || ''}">
  <link rel="icon" href="${faviconUrl}">
  <link rel="apple-touch-icon" href="${faviconUrl}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background-color: ${bgColor};
      min-height: 100vh;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 12px 12px 48px; }
    @media (min-width: 768px) { .container { padding: 64px 16px; } }
    
    .header { text-align: center; margin-bottom: 16px; }
    @media (min-width: 768px) { .header { margin-bottom: 40px; } }
    
    .header-box {
      display: inline-block;
      padding: 24px 32px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%);
      backdrop-filter: blur(15px);
      border: 3px solid rgba(255, 215, 0, 0.4);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2);
    }
    @media (min-width: 768px) { .header-box { padding: 32px 48px; } }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      margin-bottom: 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      background: linear-gradient(90deg, #FFD700 0%, #FFA500 100%);
      color: #000000;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.5);
    }
    @media (min-width: 768px) { .badge { font-size: 14px; } }
    
    .title {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.1;
      background: linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8));
    }
    @media (min-width: 768px) { .title { font-size: 48px; } }
    @media (min-width: 1024px) { .title { font-size: 60px; } }
    
    .video-container {
      width: 100%;
      margin-bottom: 16px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
    @media (min-width: 768px) { .video-container { margin-bottom: 48px; } }
    
    .video-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      background: #1a1a2e;
    }
    
    .video-wrapper iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    
    .offer-section {
      text-align: center;
      padding: 40px 24px;
      border-radius: 16px;
      max-width: 900px;
      margin: 0 auto;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%);
      backdrop-filter: blur(10px);
      border: 2px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }
    @media (min-width: 768px) { .offer-section { padding: 64px 48px; } }
    
    .offer-badge {
      display: inline-block;
      padding: 8px 16px;
      margin-bottom: 24px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      background-color: #FFD700;
      color: #2c3e50;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
    }
    
    .offer-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #ffffff;
      text-shadow: 3px 3px 6px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .offer-title { font-size: 32px; } }
    
    .offer-subtitle {
      font-size: 16px;
      margin-bottom: 24px;
      font-weight: 500;
      color: #ffffff;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .offer-subtitle { font-size: 18px; } }
    
    .offer-image {
      max-width: 260px;
      margin: 0 auto 40px;
      display: block;
      border-radius: 8px;
    }
    
    .benefits-box {
      margin-bottom: 40px;
      text-align: left;
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
      padding: 24px;
      border-radius: 12px;
      background-color: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .benefit-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .benefit-item:last-child { margin-bottom: 0; }
    
    .benefit-check {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: #90EE90;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .benefit-check svg {
      width: 16px;
      height: 16px;
      stroke: #000;
      stroke-width: 4;
    }
    
    .benefit-text {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .benefit-text { font-size: 18px; } }
    
    .price-box {
      padding: 32px;
      margin-bottom: 40px;
      border-radius: 12px;
      text-align: center;
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 100%);
      border: 3px solid rgba(255, 215, 0, 0.8);
      box-shadow: 0 15px 40px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
    }
    
    .price-text {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.6;
      color: #ffffff;
      text-shadow: 2px 2px 6px rgba(0,0,0,0.9);
    }
    @media (min-width: 768px) { .price-text { font-size: 24px; } }
    
    .cta-button {
      display: block;
      width: 100%;
      padding: 24px 48px;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #FFFFFF;
      background: linear-gradient(135deg, ${buttonColor} 0%, ${buttonColor}dd 100%);
      border: 4px solid rgba(255, 255, 255, 0.5);
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      box-shadow: 0 15px 40px ${buttonColor}99, inset 0 2px 0 rgba(255,255,255,0.3);
      text-shadow: 2px 2px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5);
      transition: transform 0.3s ease;
    }
    @media (min-width: 768px) { .cta-button { font-size: 24px; padding: 32px 48px; } }
    .cta-button:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    ${webinar.replayBadgeText || webinar.replayTitle ? `
    <div class="header">
      <div class="header-box">
        ${webinar.replayBadgeText ? `<div class="badge">${webinar.replayBadgeText}</div>` : ''}
        ${webinar.replayTitle ? `<h1 class="title">${webinar.replayTitle}</h1>` : ''}
      </div>
    </div>
    ` : ''}
    
    <div class="video-container">
      <div class="video-wrapper">
        <iframe 
          src="https://autowebinar-znc5.onrender.com/w/${webinar.slug}/replay?embed=1"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </div>
    
    ${webinar.replayOfferBadgeText || webinar.replayOfferTitle || benefits.length > 0 ? `
    <div class="offer-section">
      ${webinar.replayOfferBadgeText ? `<div class="offer-badge">${webinar.replayOfferBadgeText}</div>` : ''}
      ${webinar.replayOfferTitle ? `<h2 class="offer-title">${webinar.replayOfferTitle}</h2>` : ''}
      ${webinar.replayOfferSubtitle ? `<p class="offer-subtitle">${webinar.replayOfferSubtitle}</p>` : ''}
      ${webinar.replayOfferImageUrl ? `<img src="${webinar.replayOfferImageUrl}" alt="Oferta" class="offer-image">` : ''}
      
      ${benefits.length > 0 ? `
      <div class="benefits-box">
        ${benefits.map(b => `
        <div class="benefit-item">
          <div class="benefit-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <span class="benefit-text">${b}</span>
        </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${webinar.replayPriceText ? `
      <div class="price-box">
        <p class="price-text">${webinar.replayPriceText}</p>
      </div>
      ` : ''}
      
      ${webinar.replayButtonUrl && webinar.replayButtonText ? `
      <a href="${webinar.replayButtonUrl}" target="_blank" rel="noopener noreferrer" class="cta-button">
        ${webinar.replayButtonText}
      </a>
      ` : ''}
    </div>
    ` : ''}
  </div>
</body>
</html>`;
}

function generateHtaccess() {
  return `# .htaccess para páginas do webinar carlos
RewriteEngine On

# Força HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Remove extensão .html
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.*)$ $1.html [L]

# Cache para assets
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 1 hour"
  ExpiresByType text/css "access plus 1 week"
  ExpiresByType application/javascript "access plus 1 week"
  ExpiresByType image/png "access plus 1 month"
  ExpiresByType image/jpeg "access plus 1 month"
  ExpiresByType image/gif "access plus 1 month"
</IfModule>

# Compressão GZIP
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>
`;
}

function generateAula1HTML() {
  const bibliaPlusLogoUrl = 'https://erodfrfuuhxdaeqfjzsn.supabase.co/storage/v1/object/public/webinar-images/system/biblia-plus-logo.jpeg';
  const faviconUrl = 'https://erodfrfuuhxdaeqfjzsn.supabase.co/storage/v1/object/public/webinar-images/seo/0aa8144e-4978-40b9-9dc6-dc0367a19091/default-webinar-id/favicon.png';
  
  const benefits = [
    "Estudos versículo por versículo dos 4 Evangelhos",
    "Aula ao vivo toda segunda-feira",
    "Acesso a mais de 400 aulas sobre várias passagens da Bíblia",
    "Acompanhamento do teólogo para todas as suas dúvidas"
  ];
  
  const benefitsHTML = benefits.map((benefit, index) => `
    <div class="benefit-item">
      <div class="check-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <span>${benefit}</span>
    </div>
  `).join('');
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aula 1 - O Susto do Evangelho | Bíblia+</title>
  <meta name="description" content="Aula 1 do curso Evangelho de Mateus - O Susto do Evangelho">
  <link rel="icon" href="${faviconUrl}">
  <link rel="apple-touch-icon" href="${faviconUrl}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background-color: #4A8BB5;
      min-height: 100vh;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 12px 12px 48px; }
    @media (min-width: 768px) { .container { padding: 64px 16px; } }
    
    .header { text-align: center; margin-bottom: 16px; }
    @media (min-width: 768px) { .header { margin-bottom: 40px; } }
    
    .header-box {
      display: inline-block;
      padding: 24px 32px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%);
      backdrop-filter: blur(15px);
      border: 3px solid rgba(255, 215, 0, 0.4);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.2);
    }
    @media (min-width: 768px) { .header-box { padding: 32px 48px; } }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      margin-bottom: 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      background: linear-gradient(90deg, #FFD700 0%, #FFA500 100%);
      color: #000000;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.5);
    }
    @media (min-width: 768px) { .badge { font-size: 14px; } }
    
    .title {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.1;
      background: linear-gradient(180deg, #FFFFFF 0%, #FFD700 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8));
    }
    @media (min-width: 768px) { .title { font-size: 48px; } }
    @media (min-width: 1024px) { .title { font-size: 60px; } }
    
    .video-container {
      width: 100%;
      margin-bottom: 16px;
      border-radius: 12px;
      overflow: hidden;
      border: 4px solid white;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    @media (min-width: 768px) { .video-container { margin-bottom: 48px; } }
    
    .video-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      background: #1a1a2e;
    }
    
    .video-wrapper iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    
    .offer-section {
      text-align: center;
      padding: 40px 24px;
      border-radius: 16px;
      max-width: 900px;
      margin: 0 auto;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%);
      backdrop-filter: blur(10px);
      border: 2px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }
    @media (min-width: 768px) { .offer-section { padding: 64px 48px; } }
    
    .offer-badge {
      display: inline-block;
      padding: 8px 16px;
      margin-bottom: 24px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      background-color: #FFD700;
      color: #2c3e50;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
    }
    
    .offer-title {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 16px;
      text-shadow: 3px 3px 6px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .offer-title { font-size: 36px; } }
    
    .offer-subtitle {
      font-size: 16px;
      font-weight: 500;
      color: #ffffff;
      margin-bottom: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .offer-subtitle { font-size: 18px; } }
    
    .logo-container {
      margin-bottom: 40px;
    }
    
    .logo-container img {
      max-width: 280px;
      margin: 0 auto;
      display: block;
      border-radius: 8px;
      box-shadow: 0 8px 25px rgba(227, 30, 36, 0.5);
    }
    
    .benefits-box {
      text-align: left;
      max-width: 640px;
      margin: 0 auto 40px;
      padding: 24px;
      border-radius: 12px;
      background-color: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .benefit-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .benefit-item:last-child { margin-bottom: 0; }
    
    .check-icon {
      flex-shrink: 0;
      padding: 6px;
      border-radius: 9999px;
      background-color: #90EE90;
    }
    
    .benefit-item span {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
    }
    @media (min-width: 768px) { .benefit-item span { font-size: 18px; } }
    
    .pricing-box {
      padding: 32px;
      margin-bottom: 40px;
      border-radius: 12px;
      text-align: center;
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 100%);
      border: 3px solid rgba(255, 215, 0, 0.8);
      box-shadow: 0 15px 40px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
    }
    
    .pricing-text {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.6;
      color: #ffffff;
      text-shadow: 2px 2px 6px rgba(0,0,0,0.9);
    }
    @media (min-width: 768px) { .pricing-text { font-size: 24px; } }
    
    .price-highlight {
      color: #FFD700;
      text-shadow: 2px 2px 8px rgba(0,0,0,1), 0 0 20px rgba(255,215,0,0.6);
      font-size: 1.2em;
    }
    
    .cta-button {
      display: block;
      width: 100%;
      padding: 20px 48px;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #FFFFFF;
      background: linear-gradient(135deg, #27AE60 0%, #2ECC71 100%);
      border: 4px solid rgba(255, 255, 255, 0.5);
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      box-shadow: 0 15px 40px rgba(46, 204, 113, 0.7), inset 0 2px 0 rgba(255,255,255,0.3);
      text-shadow: 2px 2px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5);
      transition: transform 0.3s ease;
    }
    @media (min-width: 768px) { .cta-button { font-size: 24px; padding: 24px 48px; } }
    .cta-button:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-box">
        <div class="badge">⭐ AULA 1 - EVANGELHO MATHEUS ⭐</div>
        <h1 class="title">O SUSTO DO EVANGELHO</h1>
      </div>
    </div>
    
    <div class="video-container">
      <div class="video-wrapper">
        <iframe
          src="https://videomng.builderall.com/embed/DoDyfSh3Li/?autoplay=1&controls=1&speed=1&allowpause=1"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </div>
    
    <div class="offer-section">
      <div class="offer-badge">🎁 OFERTA ESPECIAL 🎁</div>
      
      <h2 class="offer-title">INSCRIÇÕES ABERTAS PARA OS CURSOS BÍBLICOS 😊</h2>
      
      <p class="offer-subtitle">A partir de agora você poderá ser meu aluno, minha aluna na</p>
      
      <div class="logo-container">
        <img src="${bibliaPlusLogoUrl}" alt="Bíblia+" />
      </div>
      
      <div class="benefits-box">
        ${benefitsHTML}
      </div>
      
      <div class="pricing-box">
        <p class="pricing-text">
          💳 O valor da inscrição é <strong class="price-highlight">12x R$ 59,90</strong> no cartão<br />
          ou um valor único de <strong class="price-highlight">R$ 660,00</strong> por 12 meses de estudos.
        </p>
      </div>
      
      <a href="https://clkdmg.site/pay/curso-biblico-perpetuo-a-vistacartao" target="_blank" rel="noopener noreferrer" class="cta-button">
        FAZER MINHA INSCRIÇÃO AGORA
      </a>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  try {
    // Buscar dados do webinar
    const webinar = await fetchWebinarData();
    console.log(`Webinar encontrado: ${webinar.name} (${webinar.slug})`);
    
    // Criar diretório de saída
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Gerar página de transmissão
    const transmissaoHTML = generateTransmissaoHTML(webinar);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), transmissaoHTML);
    console.log('✅ Página de transmissão criada: dist/carlos/index.html');
    
    // Gerar página de replay
    const replayHTML = generateReplayHTML(webinar);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'replay.html'), replayHTML);
    console.log('✅ Página de replay criada: dist/carlos/replay.html');
    
    // Gerar página aula-1
    const aula1HTML = generateAula1HTML();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'aula-1.html'), aula1HTML);
    console.log('✅ Página aula-1 criada: dist/carlos/aula-1.html');
    
    // Gerar .htaccess
    const htaccess = generateHtaccess();
    fs.writeFileSync(path.join(OUTPUT_DIR, '.htaccess'), htaccess);
    console.log('✅ Arquivo .htaccess criado: dist/carlos/.htaccess');
    
    console.log('\n🎉 Exportação concluída! Arquivos disponíveis em: dist/carlos/');
    console.log('   - index.html (página de transmissão)');
    console.log('   - replay.html (página de replay)');
    console.log('   - aula-1.html (página aula 1)');
    console.log('   - .htaccess (configurações Apache)');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
