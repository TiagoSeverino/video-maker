const readline = require("readline-sync");
const state = require("./state.js");
const Parser = require("rss-parser");

async function robot() {
  const content = {
    maximumSentences: 7,
  };

  content.searchTerm = await askAndReturnSearchTerm();
  content.prefix = askAndReturnPrefix();
  content.lang = askAndReturnLanguage();
  state.save(content);

  async function askAndReturnSearchTerm() {
    const response = readline.question(
      "Type a Wikipedia search term or G to fetch google trends: "
    );

    return response.toUpperCase() === "G"
      ? await askAndReturnTrend()
      : response;
  }

  async function askAndReturnTrend() {
    const geo = ["BR", "US"];
    const selectedGeoIndex = readline.keyInSelect(geo, "Choice Trend Geo: ");
    const selectedGeoText = geo[selectedGeoIndex];
    content.trendGeo = selectedGeoText;

    console.log("Please Wait...");
    const trends = await getGoogleTrends();
    const choice = readline.keyInSelect(trends, "Choose your trend:");

    return trends[choice];
  }

  async function getGoogleTrends() {
    const TREND_URL =
      "https://trends.google.com/trends/trendingsearches/daily/rss?geo=" +
      content.trendGeo;

    const parser = new Parser();
    const trends = await parser.parseURL(TREND_URL);
    return trends.items.map(({ title }) => title);
  }

  function askAndReturnPrefix() {
    const prefixes = ["Who is", "What is", "The history of"];
    const selectedPrefixIndex = readline.keyInSelect(
      prefixes,
      "Choose one option: "
    );
    const selectedPrefixText = prefixes[selectedPrefixIndex];

    return selectedPrefixText;
  }

  function askAndReturnLanguage() {
    const language = ["pt", "en", "es", "fr"];
    const selectedLangIndex = readline.keyInSelect(
      language,
      "Choose Language: "
    );
    const selectedLangText = language[selectedLangIndex];
    return selectedLangText;
  }
}

module.exports = robot;
