const API_BASE = "https://haappiibilling.in/api";

function getPortfolioSlug() {
    const path = window.location.pathname;
    let m = path.match(/^\/portfolio\/([^/]+)/);
    if (m) return decodeURIComponent(m[1]);
    m = path.match(/^\/([a-zA-Z0-9_-]+)_portfolio/);
    if (m) return m[1];
    return "sathish_kumar_lakshman";
}

async function loadPortfolioConfig() {
    try {
        const slug = getPortfolioSlug();
        const res = await fetch(`${API_BASE}/platform/public/portfolios/${encodeURIComponent(slug)}`);
        if (res.status === 404) return { __notFound: true };
        if (!res.ok) return null;
        const cfg = await res.json();

        // If photo_url is a relative path or 404, try team profile photo
        if (cfg.photo_url && !cfg.photo_url.startsWith('http')) {
            try {
                const check = await fetch(cfg.photo_url, { method: 'HEAD' });
                if (!check.ok) cfg.photo_url = '';
            } catch { cfg.photo_url = ''; }
        }
        if (!cfg.photo_url) {
            try {
                const teamRes = await fetch(`${API_BASE}/platform/public/team-profiles`);
                if (teamRes.ok) {
                    const profiles = await teamRes.json();
                    const first = profiles.find(p => p.photo_url);
                    if (first) cfg.photo_url = first.photo_url;
                }
            } catch {}
        }

        return cfg;
    } catch {
        return null;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'SK';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// This static shell is reused for every portfolio slug — if the slug
// doesn't exist, don't silently leave Sathish's hardcoded fallback
// content on screen; show that the page genuinely isn't there.
function showPortfolioNotFound() {
    document.title = 'Portfolio Not Found';
    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:'Inter',sans-serif;background:#0a0a0f;color:#fff;">
            <div style="font-size:56px;margin-bottom:16px;">🔍</div>
            <h1 style="font-size:26px;font-weight:800;margin:0 0 8px;">Portfolio Not Found</h1>
            <p style="color:#9ca3af;font-size:15px;max-width:420px;margin:0 0 24px;line-height:1.6;">
                This portfolio doesn't exist or may have been removed.
            </p>
            <a href="https://haappiibilling.in" style="padding:12px 26px;border-radius:12px;background:linear-gradient(135deg,#6c63ff,#4834d4);color:#fff;text-decoration:none;font-weight:700;font-size:14px;">
                Go to Haappii Billing
            </a>
        </div>`;
}

function applyConfig(cfg) {
    // Note: an empty-but-valid {} config (a portfolio that exists but has
    // nothing filled in yet) must still run through here — that's what
    // blanks the hero name and keeps the data-driven sections hidden,
    // instead of silently leaving the raw hardcoded shell content visible.
    if (!cfg) return;

    // Section visibility
    const vis = cfg.visible_sections || {};
    const sectionMap = {
        hero: '.hero',
        stats: '.stats',
        tech_marquee: '.tech-marquee',
        about: '.about',
        experience: '.experience',
        projects: '.projects',
        education: '.education',
        contact: '.contact',
    };
    Object.entries(sectionMap).forEach(([key, selector]) => {
        if (vis[key] === false) {
            const el = document.querySelector(selector);
            if (el) el.style.display = 'none';
        }
    });

    // Hero
    const isLegacySlug = getPortfolioSlug() === 'sathish_kumar_lakshman';
    const displayName = cfg.hero_name || (!isLegacySlug ? cfg.hero_title_line1 : '') || '';
    const nameEl = document.querySelector('.hero-name');
    if (nameEl) {
        if (displayName) {
            nameEl.textContent = displayName;
        } else if (!isLegacySlug) {
            // Don't leak the default hardcoded name onto someone else's portfolio.
            nameEl.textContent = '';
        }
    }
    if (displayName) {
        document.title = `${displayName} | Software Engineer`;
    }
    // Nav badge / loader / avatar fallback all hardcoded "SK" in the shell —
    // this page is reused for every portfolio, so derive it from whoever's
    // page is actually being viewed instead of always showing Sathish's.
    const initials = getInitials(displayName);
    ['.nav-logo', '.loader-text'].forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) el.innerHTML = `${escapeHtml(initials)}<span class="dot">.</span>`;
    });
    const avatarInitials = document.querySelector('.hero-image-placeholder .initials');
    if (avatarInitials) avatarInitials.textContent = initials;
    const badge = document.querySelector('.hero-badge');
    if (badge && cfg.hero_badge) {
        badge.childNodes[badge.childNodes.length - 1].textContent = " " + cfg.hero_badge;
    }
    const titleEl = document.querySelector('.hero-title');
    if (titleEl && (cfg.hero_title_line1 || cfg.hero_title_line2)) {
        titleEl.innerHTML = `${escapeHtml(cfg.hero_title_line1 || '')}<br><span class="gradient-text">${escapeHtml(cfg.hero_title_line2 || '')}</span>`;
    }
    if (cfg.hero_subtitle) {
        const sub = document.querySelector('.hero-subtitle');
        if (sub) sub.textContent = cfg.hero_subtitle;
    }

    // Photo
    if (cfg.photo_url) {
        const placeholder = document.getElementById('heroImage');
        if (placeholder) {
            placeholder.classList.add('has-photo');
            const img = document.createElement('img');
            img.src = cfg.photo_url;
            img.alt = displayName || 'Profile photo';
            img.loading = 'eager';
            placeholder.appendChild(img);
        }
    }

    // Stats (section is hidden by default in the shell — only show it
    // once there's actually data, and only if the admin hasn't hidden it)
    if (cfg.stats?.length && vis.stats !== false) {
        const section = document.querySelector('.stats');
        const grid = document.querySelector('.stats-grid');
        if (grid) {
            grid.innerHTML = cfg.stats.map((s, i) =>
                `${i > 0 ? '<div class="stat-divider"></div>' : ''}
                <div class="stat-item animate-on-scroll">
                    <span class="stat-number" data-count="${escapeHtml(s.number)}">0</span><span class="stat-suffix">${escapeHtml(s.suffix)}</span>
                    <span class="stat-label">${escapeHtml(s.label)}</span>
                </div>`
            ).join('');
        }
        if (section) section.style.display = '';
    }

    // Tech marquee (same hidden-until-populated pattern)
    if (cfg.tech_stack?.length && vis.tech_marquee !== false) {
        const section = document.querySelector('.tech-marquee');
        const content = document.querySelector('.marquee-content');
        if (content) {
            const items = cfg.tech_stack.map(t =>
                `<span class="marquee-item">${escapeHtml(t)}</span><span class="marquee-dot">✦</span>`
            ).join('');
            content.innerHTML = items + items;
        }
        if (section) section.style.display = '';
    }

    // About
    const aboutText = document.querySelector('.about-text');
    let hasAboutText = false;
    if (aboutText) {
        const parts = [];
        if (cfg.profile_summary) parts.push(`<p class="about-lead">${escapeHtml(cfg.profile_summary)}</p>`);
        if (cfg.profile_detail_1) parts.push(`<p>${escapeHtml(cfg.profile_detail_1)}</p>`);
        if (cfg.profile_detail_2) parts.push(`<p>${escapeHtml(cfg.profile_detail_2)}</p>`);
        if (parts.length) {
            aboutText.innerHTML = parts.join('');
            hasAboutText = true;
        }
    }

    // Skills
    let hasSkills = false;
    if (cfg.skill_categories?.length) {
        const skillsEl = document.querySelector('.about-skills');
        if (skillsEl) {
            skillsEl.innerHTML = cfg.skill_categories.map(cat =>
                `<div class="skill-category">
                    <h4>${escapeHtml(cat.title)}</h4>
                    <div class="skill-tags">${cat.tags.map(t => `<span class="skill-tag">${escapeHtml(t)}</span>`).join('')}</div>
                </div>`
            ).join('');
            skillsEl.style.display = '';
            hasSkills = true;
        }
    }
    // Nothing to show in About at all — hide the whole section rather
    // than leaving an empty heading with nothing underneath it.
    if (!hasAboutText && !hasSkills) {
        const aboutSection = document.querySelector('.about');
        if (aboutSection && vis.about !== false) aboutSection.style.display = 'none';
    }

    // Experience (hidden by default in the shell — show once populated)
    if (cfg.experiences?.length && vis.experience !== false) {
        const section = document.querySelector('.experience');
        const timeline = document.querySelector('.timeline');
        if (timeline) {
            timeline.innerHTML = cfg.experiences.map((exp, i) =>
                `<div class="timeline-item animate-on-scroll">
                    <div class="timeline-marker">
                        <div class="timeline-dot ${i === 0 ? 'active-dot' : ''}"></div>
                        <div class="timeline-line"></div>
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <div>
                                <h3>${escapeHtml(exp.title)}</h3>
                                <p class="company">${escapeHtml(exp.company)}</p>
                                ${exp.projects ? `<p class="projects-label">Projects: ${escapeHtml(exp.projects)}</p>` : ''}
                            </div>
                            <span class="timeline-date">${escapeHtml(exp.date)}</span>
                        </div>
                        <ul class="timeline-details">
                            ${(exp.points || []).filter(p => p.trim()).map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                        </ul>
                    </div>
                </div>`
            ).join('');
        }
        if (section) section.style.display = '';
    }

    // Projects (hidden by default in the shell — show once populated)
    if (cfg.projects?.length && vis.projects !== false) {
        const section = document.querySelector('.projects');
        const grid = document.querySelector('.projects-grid');
        if (grid) {
            const icons = {
                monitor: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
                server: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
            };
            grid.innerHTML = cfg.projects.map((proj, i) =>
                `<div class="project-card ${i === 0 ? 'project-card-featured' : ''} animate-on-scroll">
                    <div class="project-card-header">
                        <div class="project-icon">${icons[proj.icon] || icons.monitor}</div>
                        <div class="project-links"><span class="project-type">${escapeHtml(proj.type)}</span></div>
                    </div>
                    <h3 class="project-title">${escapeHtml(proj.title)}</h3>
                    <p class="project-description">${escapeHtml(proj.description)}</p>
                    <div class="project-features">
                        ${(proj.features || []).filter(f => f.trim()).map(f =>
                            `<div class="feature-item"><span class="feature-check">✓</span><span>${escapeHtml(f)}</span></div>`
                        ).join('')}
                    </div>
                    <div class="project-tech">
                        ${(proj.tech || []).map(t => `<span>${escapeHtml(t)}</span>`).join('')}
                    </div>
                </div>`
            ).join('');
        }
        if (section) section.style.display = '';
    }

    // Education (hidden by default in the shell — show once populated)
    if (cfg.education?.length && vis.education !== false) {
        const section = document.querySelector('.education');
        const grid = document.querySelector('.education-grid');
        if (grid) {
            grid.innerHTML = cfg.education.map(edu =>
                `<div class="edu-card animate-on-scroll">
                    <div class="edu-year">${escapeHtml(edu.year)}</div>
                    <h3>${escapeHtml(edu.title)}</h3>
                    <p class="edu-school">${escapeHtml(edu.school)}</p>
                    <div class="edu-score">${escapeHtml(edu.score)}</div>
                </div>`
            ).join('');
        }
        if (section) section.style.display = '';
    }

    // Contact — every item here is hidden by default in the shell (no
    // config value = don't show/leak it), and only revealed once cfg
    // actually supplies it.
    if (cfg.email) {
        const item = document.getElementById('contactEmailItem');
        const link = item?.querySelector('.contact-value');
        if (link) { link.href = `mailto:${cfg.email}`; link.textContent = cfg.email; }
        if (item) item.style.display = '';

        const socialEmail = document.getElementById('socialEmail');
        if (socialEmail) { socialEmail.href = `mailto:${cfg.email}`; socialEmail.style.display = ''; }
        const footerEmail = document.getElementById('footerEmail');
        if (footerEmail) { footerEmail.href = `mailto:${cfg.email}`; footerEmail.style.display = ''; }
    }
    if (cfg.phone) {
        const item = document.getElementById('contactPhoneItem');
        const link = item?.querySelector('.contact-value');
        if (link) { link.href = `tel:${cfg.phone.replace(/\s/g, '')}`; link.textContent = cfg.phone; }
        if (item) item.style.display = '';
    }
    if (cfg.location) {
        const item = document.getElementById('contactLocationItem');
        const val = item?.querySelector('.contact-value');
        if (val) val.textContent = cfg.location;
        if (item) item.style.display = '';
    }
    if (cfg.linkedin_url) {
        const social = document.getElementById('socialLinkedin');
        if (social) { social.href = cfg.linkedin_url; social.style.display = ''; }
        const footerLink = document.getElementById('footerLinkedin');
        if (footerLink) { footerLink.href = cfg.linkedin_url; footerLink.style.display = ''; }
    }
    if (cfg.github_url) {
        const social = document.getElementById('socialGithub');
        if (social) { social.href = cfg.github_url; social.style.display = ''; }
        const footerLink = document.getElementById('footerGithub');
        if (footerLink) { footerLink.href = cfg.github_url; footerLink.style.display = ''; }
    }
    const footerConnectCol = document.getElementById('footerConnectCol');
    if (footerConnectCol && (cfg.linkedin_url || cfg.github_url || cfg.email)) {
        footerConnectCol.style.display = '';
    }

    // Footer branding
    if (displayName) {
        const footerText = document.querySelector('.footer-text');
        if (footerText) footerText.textContent = `${displayName}'s portfolio.`;
        const copyright = document.getElementById('footerCopyright');
        if (copyright) copyright.innerHTML = `&copy; ${new Date().getFullYear()} ${escapeHtml(displayName)}. All rights reserved.`;
    }
    ['.footer-logo'].forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) el.innerHTML = `${escapeHtml(initials)}<span class="dot">.</span>`;
    });
}

function initAnimations() {
    const animateElements = document.querySelectorAll('.animate-on-scroll:not(.visible)');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    animateElements.forEach(el => observer.observe(el));

    const statNumbers = document.querySelectorAll('.stat-number[data-count]');
    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.count);
                if (isNaN(target)) return;
                const duration = 2000;
                const start = performance.now();
                const animate = (now) => {
                    const progress = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    el.textContent = Math.floor(eased * target);
                    if (progress < 1) requestAnimationFrame(animate);
                    else el.textContent = target;
                };
                requestAnimationFrame(animate);
                statObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });
    statNumbers.forEach(el => statObserver.observe(el));
}

document.addEventListener('DOMContentLoaded', async () => {
    const navbar = document.getElementById('navbar');
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');
    const loader = document.getElementById('loader');

    // Navbar scroll
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    });

    // Mobile menu
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // Active nav link on scroll
    const sections = document.querySelectorAll('section[id]');
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY + 100;
        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');
            const link = document.querySelector(`.nav-links a[href="#${id}"]`);
            if (link) {
                link.classList.toggle('active', scrollY >= top && scrollY < top + height);
            }
        });
    });

    // Load dynamic config from API (non-blocking — uses defaults if API unavailable)
    const cfg = await loadPortfolioConfig();

    if (cfg && cfg.__notFound) {
        loader.classList.add('hidden');
        showPortfolioNotFound();
        return;
    }

    applyConfig(cfg);

    // Init animations after content is applied
    initAnimations();

    // Hide loader
    loader.classList.add('hidden');

    // Contact form
    const contactForm = document.getElementById('contactForm');
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = contactForm.querySelector('button[type="submit"]');
        const original = btn.innerHTML;

        const formData = {
            name: contactForm.querySelector('#name').value,
            email: contactForm.querySelector('#email').value,
            subject: contactForm.querySelector('#subject')?.value || '',
            message: contactForm.querySelector('#message').value,
        };

        btn.innerHTML = '<span class="loader-ring" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle"></span> Sending...';
        btn.disabled = true;

        try {
            await fetch(`${API_BASE}/platform/public/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
        } catch {
            // silently continue — form still shows success for UX
        }

        btn.innerHTML = '✓ Message Sent!';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            btn.innerHTML = original;
            btn.style.background = '';
            btn.disabled = false;
            contactForm.reset();
        }, 3000);
    });

    // Smooth hover parallax on hero image
    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual && window.innerWidth > 768) {
        heroVisual.addEventListener('mousemove', (e) => {
            const rect = heroVisual.getBoundingClientRect();
            const x = (e.clientX - rect.left - rect.width / 2) / 20;
            const y = (e.clientY - rect.top - rect.height / 2) / 20;
            heroVisual.querySelector('.hero-image-wrapper').style.transform = `translate(${x}px, ${y}px)`;
        });
        heroVisual.addEventListener('mouseleave', () => {
            heroVisual.querySelector('.hero-image-wrapper').style.transform = '';
        });
    }
});
