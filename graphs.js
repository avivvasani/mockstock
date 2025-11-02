import { stockData } from "./stockData.js";

document.addEventListener('DOMContentLoaded', () => {
    const chartTitle = document.getElementById('chart-title');
    const chartMessage = document.getElementById('chart-loading-message');
    const chartDisplayArea = document.getElementById('chart-display-area');
    const tabsContainer = document.getElementById('category-tabs');
    const chartCanvas = document.getElementById('priceChart');
    
    let priceChart; 
    let allHistoryData = {}; 
    let selectedCategory = '';
    const MAX_DATA_POINTS = 600;

    // List of categories derived from stockData
    const categories = stockData.map(d => d.category);

    // Helper to format the time label
    const formatTimeLabel = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { hour12: false, second: '2-digit', minute: '2-digit', hour: '2-digit' });
    };
    
    // --- UI Rendering ---

    const renderTabs = () => {
        tabsContainer.innerHTML = '';
        categories.forEach(category => {
            const button = document.createElement('button');
            button.textContent = category;
            button.className = 'tab-button px-6 py-3 text-lg focus:outline-none';
            button.dataset.category = category;
            button.onclick = () => handleTabClick(category);
            tabsContainer.appendChild(button);
        });
        // Select the first category by default
        if (categories.length > 0) {
            handleTabClick(categories[0]);
        }
    };

    const handleTabClick = (category) => {
        selectedCategory = category;
        
        // Update tab styling
        tabsContainer.querySelectorAll('.tab-button').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Ensure the chart is updated or initialized
        if (!priceChart) {
            initializeChart();
        }
        updateChart(selectedCategory);
    };

    // --- Chart Logic ---

    const initializeChart = () => {
        priceChart = new Chart(chartCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Average Price (INR)',
                    data: [],
                    borderColor: 'rgb(0, 100, 0)', 
                    backgroundColor: 'rgba(0, 100, 0, 0.1)',
                    borderWidth: 3, 
                    pointRadius: 0,
                    fill: true,
                    tension: 0.2, 
                    animation: {
                        duration: 1000,
                        easing: 'easeInOutQuad'
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Time', color: '#6c757d', font: { size: 14 } },
                        ticks: { color: '#333333' },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' }
                    },
                    y: {
                        title: { display: true, text: 'Price (₹)', color: '#6c757d', font: { size: 14 } },
                        ticks: { 
                            color: '#333333',
                            // Force currency formatting for the ticks
                            callback: (value) => `₹${value.toLocaleString('en-IN')}`
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' },
                        beginAtZero: false, 
                    }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Avg Price: ₹${context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        }
                    }
                }
            }
        });
    };

    // Fetches ALL historical data (includes categories)
    const fetchHistory = async () => {
        try {
            const response = await fetch('/api/history');
            allHistoryData = await response.json();
            
            if (selectedCategory) {
                updateChart(selectedCategory);
            }
        } catch (error) {
            chartMessage.querySelector('p').textContent = 'Error fetching history data. Is the backend running?';
            console.error('Error fetching history:', error);
        }
    };

    // Updates the chart with data for the selected category
    const updateChart = (category) => {
        const categoryData = allHistoryData[category];
        const dataset = priceChart.data.datasets[0];

        if (!categoryData || categoryData.length < 2) {
            chartMessage.querySelector('p').textContent = categoryData ? 
                'Collecting initial data points...' : 
                `No aggregate history available for ${category}.`;
            chartMessage.classList.remove('hidden');
            chartDisplayArea.classList.add('hidden');
            return;
        }

        chartMessage.classList.add('hidden');
        chartDisplayArea.classList.remove('hidden');

        const recentData = categoryData.slice(-MAX_DATA_POINTS);
        const labels = recentData.map(d => formatTimeLabel(d.time));
        const prices = recentData.map(d => d.price);
        
        // Dynamic Coloring Logic based on overall trend
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        let trend = lastPrice - firstPrice;

        const positiveColor = 'rgb(40, 167, 69)';
        const negativeColor = 'rgb(220, 53, 69)';
        const primaryColor = trend >= 0 ? positiveColor : negativeColor; 
        const secondaryColor = trend >= 0 ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)'; 

        dataset.borderColor = primaryColor;
        dataset.backgroundColor = secondaryColor;
        
        priceChart.data.labels = labels;
        dataset.data = prices;
        
        const change = (trend / firstPrice) * 100;
        
        // Update Title with INR format
        chartTitle.innerHTML = `${category} Aggregate | ₹${lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (<span style="color:${primaryColor};">${change.toFixed(2)}%</span>)`;

        priceChart.update();
    };

    // Run Initialization
    renderTabs();
    fetchHistory();
    // Poll the history API every second to keep the chart live
    setInterval(fetchHistory, 1000); 
});
