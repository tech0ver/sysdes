async function trackReadingPosition() {
	const toc = document.querySelector('starlight-toc');
	if (!toc) return;

	const sections = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
		.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
		.filter((section): section is HTMLElement => section !== null);
	if (sections.length < 2) return;

	// Wait for the text layout without waiting for unrelated external resources.
	await document.fonts.ready;

	const updateUrl = () => {
		const root = document.documentElement;
		const padding = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
		let current = sections[0];
		for (const section of sections) {
			const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
			if (section.getBoundingClientRect().top > padding + margin + 2) break;
			current = section;
		}

		const url = new URL(window.location.href);
		url.hash = current.id === '_top' ? '' : current.id;
		if (url.href !== window.location.href) {
			// Save the section without scrolling or adding a Back button entry.
			history.replaceState(history.state, '', url);
		}
	};

	let timeout: ReturnType<typeof setTimeout>;
	requestAnimationFrame(() => {
		window.addEventListener('scroll', () => {
			clearTimeout(timeout);
			// Wait for smooth anchor navigation and continuous scrolling to settle.
			timeout = setTimeout(updateUrl, 150);
		}, { passive: true });
	});
}

void trackReadingPosition();
