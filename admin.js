document.addEventListener('DOMContentLoaded', () => {
    const controlsContainer = document.getElementById('category-controls');
    const messageArea = document.getElementById('message-area');
    const loadingMessage = document.getElementById('loading-message');

    const trendClasses = {
        'up': 'trend-up',
        'down': 'trend-down',
        'none': 'trend-none',
        'MANUAL': 'trend-manual' // For display of manual override
    };
    
    const renderControls = (trends) => {
        if (loadingMessage.style.display !== 'none') {
             controlsContainer.innerHTML = ''; 
        }
        loadingMessage.style.display = 'none';

        trends.forEach(category => {
            const symbol = category.name.replace(/\s/g, ''); 
            let card = document.getElementById(`card-${symbol}`);
            
            if (!card) {
                card = document.createElement('div');
                card.id = `card-${symbol}`;
                card.className = 'admin-card p-6 rounded-xl';
                controlsContainer.appendChild(card);
            }
            
            // Determine the display trend
            const displayTrend = category.isManual ? category.trend : category.currentSequence;
            const trendClass = category.isManual ? trendClasses[category.trend] : trendClasses[category.trend] || trendClasses['none'];
            
            let updatesText;
            let statusBadge;

            if (category.isManual) {
                 updatesText = `MANUAL OVERRIDE: ${category.updatesRemaining}s remaining.`;
                 statusBadge = `MANUAL: ${category.trend.toUpperCase()}`;
            } else {
                 updatesText = `Auto Sequence (${category.currentSequence.toUpperCase()}): ${category.updatesRemaining}s until next step.`;
                 statusBadge = `AUTO: ${category.trend.toUpperCase()}`;
            }

            card.innerHTML = `
                <h3 class="text-xl font-bold mb-4" style="color: var(--primary-green);">${category.name}</h3>
                
                <div id="status-${symbol}" class="${trendClass} trend-status transition duration-300 ease-in-out">
                    ${statusBadge}
                </div>
                
                <p class="text-sm mt-3 mb-4 font-medium" style="color: #6c757d;">${updatesText}</p>
                
                <div class="control-buttons flex space-x-3 mt-4">
                    <button class="btn-up w-full px-4 py-3 rounded-lg font-bold shadow-md" 
                            data-category="${category.name}" data-trend="up">UP</button>
                    <button class="btn-down w-full px-4 py-3 rounded-lg font-bold shadow-md" 
                            data-category="${category.name}" data-trend="down">DOWN</button>
                </div>
            `;
        });

        controlsContainer.querySelectorAll('button').forEach(button => {
            button.onclick = handleControlClick;
        });
    };

    const handleControlClick = async (event) => {
        const button = event.target;
        const category = button.dataset.category;
        const trend = button.dataset.trend;
        
        button.disabled = true;
        button.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            const response = await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, trend })
            });
            const data = await response.json();

            if (data.success) {
                showMessage(`✅ Success: ${category} trend set to ${trend.toUpperCase()} (Manual Override).`, 'success');
            } else {
                showMessage(`❌ Error: ${data.message}`, 'error');
            }
            // Fetch immediately to show the change
            fetchTrends(); 
        } catch (error) {
            console.error('Error sending control command:', error);
            showMessage('Connection error with the server. Is the API running?', 'error');
        } finally {
            setTimeout(() => {
                button.disabled = false;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
            }, 500); // Small delay to prevent double-click
        }
    };

    const fetchTrends = async () => {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data && data.categoryTrends) {
                 renderControls(data.categoryTrends);
            } else {
                 throw new Error("Invalid data structure received from server.");
            }
           
        } catch (error) {
            console.error('Error fetching trends:', error);
            loadingMessage.querySelector('p').textContent = 'Could not connect to server or fetch trends. Ensure the Node.js backend is running.';
            loadingMessage.style.display = 'block';
        }
    };

    const showMessage = (message, type) => {
        messageArea.textContent = message;
        
        messageArea.classList.remove('bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 'hidden');
        
        if (type === 'success') {
            messageArea.classList.add('bg-green-100', 'text-green-800');
            messageArea.style.borderLeft = '4px solid var(--primary-green)';
        } else {
            messageArea.classList.add('bg-red-100', 'text-red-800');
            messageArea.style.borderLeft = '4px solid var(--negative-color)';
        }
        
        messageArea.style.display = 'block';
        
        setTimeout(() => {
            messageArea.style.opacity = '0';
            setTimeout(() => {
                messageArea.style.display = 'none';
                messageArea.style.opacity = '1';
            }, 300); 
        }, 3500);
    };

    fetchTrends();
    setInterval(fetchTrends, 1000); 
});
