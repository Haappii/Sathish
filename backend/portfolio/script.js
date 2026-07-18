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

function applyConfig(cfg) {
    if (!cfg || Object.keys(cfg).length === 0) return;

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
        certification: '.certification',
        contact: '.contact',
    };
    Object.entries(sectionMap).forEach(([key, selector]) => {
        if (vis[key] === false) {
            const el = document.querySelector(selector);
            if (el) el.style.display = 'none';
        }
    });

    // Hero
    const nameEl = document.querySelector('.hero-name');
    if (nameEl) {
        if (cfg.hero_name) {
            nameEl.textContent = cfg.hero_name;
        } else if (getPortfolioSlug() !== 'sathish_kumar_lakshman') {
            // Don't leak the default hardcoded name onto someone else's portfolio.
            nameEl.textContent = '';
        }
    }
    document.title = cfg.hero_name ? `${cfg.hero_name} | Software Engineer` : document.title;
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
            img.alt = 'Sathish Kumar Lakshman';
            img.loading = 'eager';
            placeholder.appendChild(img);
        }
    }

    // Stats
    if (cfg.stats?.length) {
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
    }

    // Tech marquee
    if (cfg.tech_stack?.length) {
        const content = document.querySelector('.marquee-content');
        if (content) {
            const items = cfg.tech_stack.map(t =>
                `<span class="marquee-item">${escapeHtml(t)}</span><span class="marquee-dot">✦</span>`
            ).join('');
            content.innerHTML = items + items;
        }
    }

    // About
    const aboutText = document.querySelector('.about-text');
    if (aboutText) {
        const parts = [];
        if (cfg.profile_summary) parts.push(`<p class="about-lead">${escapeHtml(cfg.profile_summary)}</p>`);
        if (cfg.profile_detail_1) parts.push(`<p>${escapeHtml(cfg.profile_detail_1)}</p>`);
        if (cfg.profile_detail_2) parts.push(`<p>${escapeHtml(cfg.profile_detail_2)}</p>`);
        if (parts.length) {
            const highlights = aboutText.querySelector('.about-highlights');
            const highlightsHtml = highlights ? highlights.outerHTML : '';
            aboutText.innerHTML = parts.join('') + highlightsHtml;
        }
    }

    // Skills
    if (cfg.skill_categories?.length) {
        const skillsEl = document.querySelector('.about-skills');
        if (skillsEl) {
            skillsEl.innerHTML = cfg.skill_categories.map(cat =>
                `<div class="skill-category">
                    <h4>${escapeHtml(cat.title)}</h4>
                    <div class="skill-tags">${cat.tags.map(t => `<span class="skill-tag">${escapeHtml(t)}</span>`).join('')}</div>
                </div>`
            ).join('');
        }
    }

    // Experience
    if (cfg.experiences?.length) {
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
    }

    // Projects
    if (cfg.projects?.length) {
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
    }

    // Education
    if (cfg.education?.length) {
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
    }

    // Contact
    if (cfg.email) {
        document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
            el.href = `mailto:${cfg.email}`;
            if (el.classList.contains('contact-value')) el.textContent = cfg.email;
        });
    }
    if (cfg.phone) {
        const phoneLink = document.querySelector('.contact-details a[href^="tel:"]');
        if (phoneLink) { phoneLink.href = `tel:${cfg.phone.replace(/\s/g, '')}`; phoneLink.textContent = cfg.phone; }
    }
    if (cfg.location) {
        document.querySelectorAll('.contact-item').forEach(item => {
            const label = item.querySelector('.contact-label');
            if (label?.textContent === 'Location') {
                const val = item.querySelector('.contact-value');
                if (val) val.textContent = cfg.location;
            }
        });
    }
    if (cfg.linkedin_url) {
        document.querySelectorAll('a[href*="linkedin"], a[aria-label="LinkedIn"]').forEach(el => {
            el.href = cfg.linkedin_url;
        });
    }
    if (cfg.github_url) {
        document.querySelectorAll('a[href*="github"], a[aria-label="GitHub"]').forEach(el => {
            el.href = cfg.github_url;
        });
    }
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
