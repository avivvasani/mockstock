import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Admin section states
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [createdItemId, setCreatedItemId] = useState(null);
  const [adminMessage, setAdminMessage] = useState('');

  // Viewer section states
  const [searchItemId, setSearchItemId] = useState('');
  const [fetchedItem, setFetchedItem] = useState(null);
  const [viewerMessage, setViewerMessage] = useState('');

  // Initialize Firebase and handle authentication
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestore);
        setAuth(firebaseAuth);

        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            // Sign in anonymously if no token or user
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          }
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("Failed to initialize Firebase:", err);
        setError("Failed to initialize Firebase. Please check your configuration.");
        setLoading(false);
      }
    };

    initFirebase();
  }, []);

  // Function to create a new item (Admin functionality)
  const createItem = async () => {
    if (!db || !userId) {
      setAdminMessage("Database not ready or user not authenticated.");
      return;
    }
    if (!itemName || !itemDescription || !itemPrice) {
      setAdminMessage("Please fill all item fields.");
      return;
    }

    setAdminMessage("Creating item...");
    try {
      // Store in a public collection accessible by all "websites"
      const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/items`), {
        name: itemName,
        description: itemDescription,
        price: parseFloat(itemPrice), // Ensure price is a number
        createdAt: new Date().toISOString(),
        createdBy: userId // Optional: track who created it
      });
      setCreatedItemId(docRef.id);
      setAdminMessage(`Item created successfully! ID: ${docRef.id}`);
      setItemName('');
      setItemDescription('');
      setItemPrice('');
    } catch (e) {
      console.error("Error adding document: ", e);
      setAdminMessage("Error creating item. See console for details.");
    }
  };

  // Function to fetch item details by ID (Viewer/Buying-Selling functionality)
  const fetchItemDetails = async () => {
    if (!db || !userId) {
      setViewerMessage("Database not ready or user not authenticated.");
      return;
    }
    if (!searchItemId) {
      setViewerMessage("Please enter an Item ID to search.");
      return;
    }

    setViewerMessage("Fetching item details...");
    try {
      const docRef = doc(db, `artifacts/${appId}/public/data/items`, searchItemId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setFetchedItem({ id: docSnap.id, ...docSnap.data() });
        setViewerMessage("Item found!");
      } else {
        setFetchedItem(null);
        setViewerMessage("No item found with that ID.");
      }
    } catch (e) {
      console.error("Error fetching document: ", e);
      setViewerMessage("Error fetching item. See console for details.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Loading application...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700 p-4 rounded-lg">
        <p className="text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center font-sans">
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        body { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="w-full max-w-4xl bg-white shadow-lg rounded-xl p-8 mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
          Centralized Data Management Demo
        </h1>
        <p className="text-gray-600 mb-4 text-center">
          This application simulates how an admin can create data with unique IDs and how other applications can retrieve that data using those IDs from a shared Firestore database.
        </p>
        <p className="text-sm text-gray-500 text-center mb-6">
          Your User ID: <span className="font-semibold text-blue-600 break-all">{userId}</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Admin Section */}
          <div className="bg-blue-50 p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-blue-800 mb-4">Admin: Create New Item</h2>
            <div className="mb-4">
              <label htmlFor="itemName" className="block text-gray-700 text-sm font-medium mb-2">Item Name:</label>
              <input
                type="text"
                id="itemName"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g., Laptop Pro X"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="itemDescription" className="block text-gray-700 text-sm font-medium mb-2">Description:</label>
              <textarea
                id="itemDescription"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-y"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="e.g., High-performance laptop with M2 chip"
              ></textarea>
            </div>
            <div className="mb-6">
              <label htmlFor="itemPrice" className="block text-gray-700 text-sm font-medium mb-2">Price ($):</label>
              <input
                type="number"
                id="itemPrice"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                placeholder="e.g., 1499.99"
                step="0.01"
              />
            </div>
            <button
              onClick={createItem}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 ease-in-out shadow-md"
            >
              Create Item
            </button>
            {adminMessage && (
              <p className="mt-4 text-sm text-center text-gray-600 bg-blue-100 p-2 rounded-md">{adminMessage}</p>
            )}
            {createdItemId && (
              <p className="mt-4 text-sm text-center text-green-700 font-semibold bg-green-100 p-2 rounded-md break-all">
                New Item ID: <span className="text-green-800">{createdItemId}</span>
              </p>
            )}
          </div>

          {/* Viewer/Buying-Selling Section */}
          <div className="bg-green-50 p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-green-800 mb-4">Viewer/Buyer: Fetch Item Details</h2>
            <div className="mb-4">
              <label htmlFor="searchItemId" className="block text-gray-700 text-sm font-medium mb-2">Enter Item ID:</label>
              <input
                type="text"
                id="searchItemId"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                value={searchItemId}
                onChange={(e) => setSearchItemId(e.target.value)}
                placeholder="Paste an item ID here"
              />
            </div>
            <button
              onClick={fetchItemDetails}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-200 ease-in-out shadow-md"
            >
              Fetch Item Details
            </button>
            {viewerMessage && (
              <p className="mt-4 text-sm text-center text-gray-600 bg-green-100 p-2 rounded-md">{viewerMessage}</p>
            )}
            {fetchedItem && (
              <div className="mt-4 p-4 bg-white rounded-md shadow-inner border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Item Details:</h3>
                <p className="text-gray-700 mb-1"><span className="font-medium">ID:</span> <span className="break-all">{fetchedItem.id}</span></p>
                <p className="text-gray-700 mb-1"><span className="font-medium">Name:</span> {fetchedItem.name}</p>
                <p className="text-gray-700 mb-1"><span className="font-medium">Description:</span> {fetchedItem.description}</p>
                <p className="text-gray-700 mb-1"><span className="font-medium">Price:</span> ${fetchedItem.price ? fetchedItem.price.toFixed(2) : 'N/A'}</p>
                <p className="text-gray-700 text-xs mt-2">
                  <span className="font-medium">Created At:</span> {new Date(fetchedItem.createdAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
