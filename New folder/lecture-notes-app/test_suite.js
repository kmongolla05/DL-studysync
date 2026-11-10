// Automated Developer Test Suite for StudySync Deep Learning Project

async function runTestSuite() {
  console.log('===========================================================');
  console.log('🧪 RUNNING FULL DEVELOPER TEST SUITE');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  // 1. Python DL Service Root
  await test('DL Microservice Root Route (GET http://127.0.0.1:8000/)', async () => {
    const res = await fetch('http://127.0.0.1:8000/');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'online') throw new Error(`Unexpected status: ${data.status}`);
  });

  // 2. Python DL Service Health
  await test('DL Microservice Health (GET http://127.0.0.1:8000/health)', async () => {
    const res = await fetch('http://127.0.0.1:8000/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.framework) throw new Error('Missing framework info');
  });

  // 3. Express DL Health Gateway
  await test('Express DL Health Gateway (GET http://localhost:5000/api/dl-health)', async () => {
    const res = await fetch('http://localhost:5000/api/dl-health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.available !== true) throw new Error('Gateway reported DL engine unavailable');
  });

  // 4. Local T5 Summarization
  await test('Local T5 Transformer Summarization (POST /api/summarize)', async () => {
    const res = await fetch('http://127.0.0.1:8000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Artificial neural networks are computing systems inspired by the biological neural networks that constitute animal brains. An ANN is based on a collection of connected units or nodes called artificial neurons.',
        mode: 'quick',
        model_type: 't5'
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.summary || data.summary.length < 15) throw new Error('Summary too short or empty');
    if (typeof data.metrics?.rouge1 !== 'number') throw new Error('Missing ROUGE-1 score');
  });

  // 5. Local DistilBART Summarization
  await test('Local DistilBART Transformer Summarization (POST /api/summarize)', async () => {
    const res = await fetch('http://127.0.0.1:8000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Gradient descent is a first-order iterative optimization algorithm for finding a local minimum of a differentiable function. The algorithm takes steps proportional to the negative of the gradient of the function at the current point.',
        mode: 'quick',
        model_type: 'bart'
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.summary || data.summary.length < 15) throw new Error('Summary too short or empty');
    if (typeof data.metrics?.rougeL !== 'number') throw new Error('Missing ROUGE-L score');
  });

  // 6. Quantitative ROUGE Scorer
  await test('Quantitative ROUGE Scorer (POST /api/evaluate)', async () => {
    const res = await fetch('http://127.0.0.1:8000/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_text: 'Deep learning neural networks learn representations of data with multiple levels of abstraction.',
        summary: 'Deep learning models learn hierarchical representations of input data.'
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.rouge1 <= 0 || data.rougeL <= 0) throw new Error('ROUGE scores not calculated properly');
  });

  // 7. Express Note Generation (T5 Mode)
  await test('End-to-End Note Synthesis via Express (Model: T5)', async () => {
    const res = await fetch('http://localhost:5000/api/generate-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lectureText: 'Recurrent neural networks possess internal memory to process arbitrary sequences of inputs. Unlike feedforward networks, RNNs can use their internal state to process sequences of inputs.',
        modelType: 't5',
        summaryMode: 'quick'
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.summary) throw new Error('Missing summary');
    if (!Array.isArray(data.keyPoints) || data.keyPoints.length === 0) throw new Error('Missing keyPoints');
    if (!Array.isArray(data.glossary) || data.glossary.length === 0) throw new Error('Missing glossary');
    if (!Array.isArray(data.quiz) || data.quiz.length === 0) throw new Error('Missing quiz');
  });

  // 8. Express Note Generation (Detailed Mode)
  await test('Detailed Mode Synthesis (Length Penalty & Beam Tuning)', async () => {
    const res = await fetch('http://localhost:5000/api/generate-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lectureText: 'Backpropagation is an algorithm used in artificial neural networks to calculate a gradient that is needed in the calculation of the weights to be used in the network. Backpropagation calculates the gradient of the error function with respect to the neural networks weights.',
        modelType: 'bart',
        summaryMode: 'detailed'
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.summaryMode !== 'detailed') throw new Error('Summary mode not retained in response');
    if (!data.dlMetrics || !data.dlMetrics.rouge1) throw new Error('Missing DL ROUGE metrics in detailed response');
  });

  // 9. AI Tutor Endpoint Resilience
  await test('AI Tutor Conversational Endpoint (POST /api/chat-tutor)', async () => {
    const res = await fetch('http://localhost:5000/api/chat-tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lectureText: 'Convolutional neural networks are specialized for computer vision.',
        notesSummary: 'CNNs excel in spatial data analysis.',
        messages: [{ role: 'user', content: 'What is the main application of CNNs?' }]
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.reply || data.reply.length < 10) throw new Error('AI Tutor did not provide valid reply');
  });

  // 10. Client Frontend Availability
  await test('React Frontend Server (GET http://localhost:5173/)', async () => {
    const res = await fetch('http://localhost:5173/');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('id="root"')) throw new Error('React mount container missing');
  });

  console.log('\n===========================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) process.exit(1);
}

runTestSuite();
