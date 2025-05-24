const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

// Initialize Claude API client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store user context in memory (in production, use a database)
const userContexts = new Map();

// Helper function to build context for Claude
function buildUserContext(userData) {
  const context = [];
  
  // Add current date/time context
  const now = new Date();
  context.push(`Current date and time: ${now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })} at ${now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  })}`);

  // Add user's personal information
  if (userData.location) {
    context.push(`User's location: ${userData.location}`);
  }

  // Add medication information
  if (userData.medications && userData.medications.length > 0) {
    const meds = userData.medications.map(med => 
      `${med.name} at ${med.time} (${med.taken ? 'taken' : 'not taken yet'} today)`
    ).join(', ');
    context.push(`Current medications: ${meds}`);
  }

  // Add item locations
  if (userData.itemLocations && Object.keys(userData.itemLocations).length > 0) {
    const items = Object.entries(userData.itemLocations)
      .map(([item, location]) => `${item}: ${location}`)
      .join(', ');
    context.push(`Item locations: ${items}`);
  }

  // Add water intake information
  if (userData.waterIntake !== undefined) {
    context.push(`Water intake today: ${userData.waterIntake} cups out of ${userData.waterGoal || 8} cup daily goal`);
  }

  // Add emergency contacts
  if (userData.emergencyContacts && userData.emergencyContacts.length > 0) {
    const contacts = userData.emergencyContacts.map(contact => 
      `${contact.name}: ${contact.phone}`
    ).join(', ');
    context.push(`Emergency contacts: ${contacts}`);
  }

  return context.join('\n');
}

// Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message, userData = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: 'Message is required and must be a string' 
      });
    }

    // Build context for Claude
    const userContext = buildUserContext(userData);
    
    // Create the system prompt for Claude
    const systemPrompt = `You are a helpful AI assistant for a senior adult. You help with daily tasks like:
- Finding items around the house
- Tracking medications and health
- Answering questions about time, date, and weather
- Providing general assistance and companionship

Guidelines for responses:
- Keep responses clear, warm, and easy to understand
- Use simple language appropriate for seniors
- Be patient and encouraging
- If asked about medical advice, suggest consulting healthcare providers
- Help with practical daily tasks
- Be conversational and friendly

Current user information:
${userContext}

Remember to use this information to give personalized, helpful responses.`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 300,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    });

    const claudeResponse = response.content[0].text;

    // Log for debugging (remove in production)
    console.log(`User: ${message}`);
    console.log(`Claude: ${claudeResponse}`);

    res.json({
      response: claudeResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Claude API Error:', error);
    
    // Handle different types of errors
    if (error.status === 401) {
      res.status(500).json({ 
        error: 'API authentication failed',
        fallback: "I'm having trouble connecting right now. Please try again in a moment."
      });
    } else if (error.status === 429) {
      res.status(429).json({ 
        error: 'Rate limit exceeded',
        fallback: "I'm getting too many requests right now. Please wait a moment and try again."
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to get response',
        fallback: "I'm having trouble understanding right now. Could you try asking again?"
      });
    }
  }
});

// Test endpoint to verify Claude API connection
router.get('/test', async (req, res) => {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: 'Say hello and confirm you are working.'
        }
      ]
    });

    res.json({
      status: 'success',
      message: 'Claude API is working correctly',
      response: response.content[0].text
    });
  } catch (error) {
    console.error('Claude API Test Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Claude API test failed',
      error: error.message
    });
  }
});

module.exports = router;
