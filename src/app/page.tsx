import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            GitHub Sock Puppet Detector
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Detect coordinated sock puppet attacks on GitHub repositories using advanced pattern
            analysis and behavioural detection
          </p>
          <div className="flex gap-4 justify-center mb-12">
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </Link>
            <a
              href="https://github.com/apps/sock-puppet-detector"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Install GitHub App
            </a>
          </div>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-2">Account Age Detection</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Flag newly created accounts participating in coordinated campaigns
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-2">Pattern Analysis</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Detect suspicious naming patterns and email similarities
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-2">Coordinated Behaviour</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Identify temporal clustering and network-based coordination
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
