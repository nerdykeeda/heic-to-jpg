// Footer Updater for imgtojpg.org
// This script automatically adds the patriotic footer text to all pages

(function() {
    'use strict';
    
    // Wait for DOM to be ready
    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }
    
    // Add footer text function
    function addFooterText() {
        // Find all footer copyright sections
        const copyrightTexts = document.querySelectorAll('p:contains("© 2025 imgtojpg.org")');
        
        copyrightTexts.forEach(copyrightText => {
            // Check if the footer text already exists
            const existingFooter = copyrightText.parentNode.querySelector('.made-with-love');
            if (existingFooter) return;
            
            // Create the footer text container
            const footerContainer = document.createElement('div');
            footerContainer.className = 'mt-4 text-center made-with-love';
            
            // Create the paragraph with inline text
            const footerText = document.createElement('p');
            footerText.className = 'text-gray-400 text-sm';
            footerText.innerHTML = 'Made with <span class="text-red-500 text-lg">❤</span> in Gurugram, India';
            
            // Add the footer text
            footerContainer.appendChild(footerText);
            
            // Insert after the copyright text
            copyrightText.parentNode.insertBefore(footerContainer, copyrightText.nextSibling);
        });
        
        // Also check for text nodes containing the copyright
        const textNodes = document.evaluate(
            "//text()[contains(., '© 2025 imgtojpg.org')]",
            document,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        
        for (let i = 0; i < textNodes.snapshotLength; i++) {
            const textNode = textNodes.snapshotItem(i);
            const parent = textNode.parentNode;
            
            // Skip if footer text already exists
            if (parent.querySelector('.made-with-love')) continue;
            
            // Check if this is a paragraph element
            if (parent.tagName === 'P') {
                // Create the footer text container
                const footerContainer = document.createElement('div');
                footerContainer.className = 'mt-4 text-center made-with-love';
                
                // Create the paragraph with inline text
                const footerText = document.createElement('p');
                footerText.className = 'text-gray-400 text-sm';
                footerText.innerHTML = 'Made with <span class="text-red-500 text-lg">❤</span> in Gurugram, India';
                
                // Add the footer text
                footerContainer.appendChild(footerText);
                
                // Insert after the paragraph
                parent.parentNode.insertBefore(footerContainer, parent.nextSibling);
            }
        }
    }
    
    // Main initialization
    function init() {
        addFooterText();
        
        // Add some delay for dynamic content
        setTimeout(() => {
            addFooterText();
        }, 1000);
    }
    
    // Run when ready
    ready(init);
    
    // Also run on navigation changes (for SPA-like behavior)
    if (window.history && window.history.pushState) {
        const originalPushState = window.history.pushState;
        window.history.pushState = function() {
            originalPushState.apply(this, arguments);
            setTimeout(addFooterText, 100);
        };
    }
    
})();
