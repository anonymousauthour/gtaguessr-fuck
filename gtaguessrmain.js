(function() {
    'use strict';

    let gameLocations = [];
    let isBusy = false;

    function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function isInNormalMode() {
      var infoDiv = document.querySelector("div.info"); 
      if (infoDiv) {
        var totalDiv = infoDiv.querySelector("div.total"); 
        return !!totalDiv; 
      }
      return false; 
    }

    function clickMapCenter() {
      try {
          const panelElement = document.querySelector('[data-control="Panel"]');
          if (!panelElement) { console.error("Panel element not found for click calc."); return; }
          const panelRect = panelElement.getBoundingClientRect();
          const screenWidth = window.innerWidth;
          const remainingWidth = screenWidth - panelRect.width;
          const x = panelRect.width + remainingWidth / 2;
          const y = window.innerHeight / 2 - 15; 

          const targetElement = document.elementFromPoint(x, y);
          if (!targetElement) { console.error("Target element for click not found at calculated center."); return; }

          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x, 
            clientY: y,
            button: 0, 
            buttons: 1, 
          });
          targetElement.dispatchEvent(clickEvent);
          console.log("Simulated click at map center (X:", x, "Y:", y, ") on element:", targetElement);
      } catch (e) {
          console.error("Error during clickMapCenter:", e);
      }
    }

    async function getVersusLocations() {
      if (isBusy) {
        console.log("Busy getting locations, skipping.");
        return;
      }
      isBusy = true;
      changeCopyrightText("Getting location list...");

      const lobbyID = localStorage.getItem("lobbyId");
      const lobbyUserID = localStorage.getItem("lobbyUserId");

      if (!lobbyID || !lobbyUserID) {
          alert("Error: Lobby ID or User ID not found in localStorage. Are you in a Versus match?");
          changeCopyrightText("Error: Lobby details not found.");
          isBusy = false;
          return;
      }

      try {
          let response = await fetch("https://gtaguessr.com/API/GetVersusLocations", {
            method: "POST",
            body: JSON.stringify({
              lobbyId: lobbyID,
              lobyUserId: lobbyUserID, 
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          response = await response.json();
          gameLocations = response?.locations ?? [];
          if (gameLocations.length === 0) {
               console.warn("Received empty locations array from API.");
               changeCopyrightText("No locations found for this lobby.");
          } else {
               console.log("Fetched game locations:", gameLocations);
               changeCopyrightText("Locations fetched. Select round.");
          }
      } catch(error) {
           alert("Error fetching locations from API. Check console (F12).");
           console.error("getVersusLocations error:", error);
           changeCopyrightText("Error fetching locations.");
      } finally {
          isBusy = false;
      }
    }

    // Uses the SubmitAGuess API endpoint exploit to get coordinates for a specific location ID
    async function getLocationByID(id) {
      if (!gameLocations || id >= gameLocations.length || !gameLocations[id]?.locationId) {
          console.error("Invalid location ID index or gameLocations not populated:", id);
          throw new Error("Invalid location ID requested.");
      }

      const locationData = gameLocations[id];
      const locationId = locationData.locationId;
      console.log(`Requesting coordinates for round ${id + 1} (Location ID: ${locationId})`);

      const randomSessionId = getRandomInt(10000000, 99999999).toString();
      const randomLobbyId = getRandomInt(10000000, 99999999).toString();
      const randomUserId = getRandomInt(555555, 999999).toString();

      try {
          let response = await fetch("https://gtaguessr.com/API/SubmitAGuess", {
            method: "POST",
            body: JSON.stringify({
              sessionId: randomSessionId,
              locationId: locationId,
              lat: `${getRandomInt(-7000, 7000)}.${getRandomInt(0, 99999)}`, 
              lng: `${getRandomInt(-7000, 7000)}.${getRandomInt(0, 99999)}`,
              lobyId: randomLobbyId, 
              lobyUserId: randomUserId, 
              game: getRandomInt(1, 5).toString(), 
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });

           if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          response = await response.json();
          const lat = response?.lat ?? 0;
          const lng = response?.lng ?? 0;

          if (lat === 0 && lng === 0 && !response?.lat && !response?.lng) {
              console.warn("API response did not contain lat/lng.", response);
              throw new Error("Coordinates not found in API response.");
          }

          console.log(`Coordinates received for round ${id + 1}:`, { lat, lng });
          return { lat, lng };

      } catch (error) {
          console.error("getLocationByID error:", error);
          throw error;
      }
    }

    async function setLocation(locationID) {
      if (isBusy) {
        console.log("Busy setting location, skipping.");
        return;
      }
      isBusy = true;

      changeCopyrightText("Finding coordinates...");
      let exactLocation;

      const mapElement = document.querySelector('[data-control="Map"]');
      if (!mapElement) { console.error("Map element not found."); isBusy = false; return; }

      // Visual feedback
      mapElement.style.transition = "filter 200ms";
      mapElement.style.filter = "grayscale(1) brightness(20%)";
      document.body.style.cursor = "progress";

      try {
        exactLocation = await getLocationByID(locationID);
      } catch(error) {
        alert("Error while finding exact location. Check console (F12).");
        mapElement.style.filter = "grayscale(0) brightness(100%)";
        document.body.style.cursor = "inherit";
        changeCopyrightText("Error finding location.");
        isBusy = false;
        return;
      }

      window.location.hash = `5/${exactLocation.lat}/${exactLocation.lng}`;
      console.log(`Updated window.location.hash to: #5/${exactLocation.lat}/${exactLocation.lng}`);

      changeCopyrightText("Map centered! Place marker manually.");

      await new Promise((resolve) => {
        setTimeout(resolve, 1500); 
      });


      mapElement.style.filter = "grayscale(0) brightness(100%)";
      document.body.style.cursor = "inherit";
      isBusy = false;

      changeCopyrightText(
        `Round ${locationID + 1} centered. Click map & submit!`,
      );
    }

    // --- UI Functions ---

    function changeCopyrightText(text) {
      try {
          const element = document.getElementById("copyright");
          if (element) {
              element.innerText = "© GtaGuessr | " + text;
          } else {
              console.warn("Copyright element not found to update text.");
          }
      } catch (e) {
           console.error("Error changing copyright text:", e);
      }
    }

    // Creates the round selection buttons after fetching locations
    async function getLocationsAndInitUI() {
        // Remove previous buttons if they exist
      const existingButtons = document.getElementById("cheatLocations");
      if (existingButtons) {
        existingButtons.remove();
        changeCopyrightText("Reloading Locations...");
      } else {
        changeCopyrightText("Finding Locations...");
      }

      const findButton = document.getElementById("cheatFindLocations");
      if (findButton) findButton.style.display = 'none';


      try {
        await getVersusLocations();
      } catch (e) {
          if (findButton) findButton.style.display = 'block';
        return; 
      }

      if (gameLocations.length === 0) {
          if (findButton) findButton.style.display = 'block';
          alert("Could not find any locations for this Versus lobby.");
          return;
      }


      const targetElement = document.querySelector('[data-control="Panel"]');
      if (!targetElement) {
           alert("Error: Could not find side panel element to insert buttons.");
           if (findButton) findButton.style.display = 'block';
           return;
      }

      const newElement = document.createElement("div");
      newElement.id = "cheatLocations";
      newElement.style.display = "grid";
      newElement.style.gridTemplateColumns = `repeat(${gameLocations.length}, 1fr)`; 
      newElement.style.columnGap = "5px";
      newElement.style.marginBottom = "5px";

      gameLocations.forEach((location, index) => {
        const buttonElement = document.createElement("button");
        buttonElement.id = `cheatSetLocation${index}`;
        buttonElement.style.backgroundColor = "#f83849";
        buttonElement.style.border = "none";
        buttonElement.style.padding = "10px 0";
        buttonElement.style.width = "100%";
        buttonElement.style.fontWeight = "500";
        buttonElement.style.color = "white";
        buttonElement.style.fontSize = '14px';
        buttonElement.style.cursor = 'pointer';
        buttonElement.addEventListener('click', () => setLocation(index));
        buttonElement.textContent = `${index + 1}`;
        newElement.appendChild(buttonElement);
      });

      targetElement.insertBefore(newElement, targetElement.firstChild);
    }

    async function activateCheats() {
      console.log("Activating Versus Helper...");
      if (window.location.host !== "gtaguessr.com") {
        alert("Unsupported website! Cheats only work on gtaguessr.com (Versus Mode)!");
        return;
      }

      if (!document.querySelector('[data-control="Map"]')) {
        alert("Cheats can only be initiated while in game (Versus Mode)!");
        return;
      }

      if (isInNormalMode()) {
        alert("Normal Mode is not supported! Only Versus Mode is!");
        return;
      }

       if (document.body.getAttribute("cheats-init") === "yes") {
        alert("Cheats already activated!");
        return;
      } else {
        document.body.setAttribute("cheats-init", "yes");
      }


      const findLocationsCheatElement = document.createElement("button");
      findLocationsCheatElement.id = "cheatFindLocations"; 
      findLocationsCheatElement.style.border = "none";
      findLocationsCheatElement.style.backgroundColor = "#f83849";
      findLocationsCheatElement.style.padding = "10px 20px"; /
      findLocationsCheatElement.style.fontWeight = "500";
      findLocationsCheatElement.style.color = "white";
      findLocationsCheatElement.style.zIndex = "99999"; 
      findLocationsCheatElement.style.bottom = "20px"; 
      findLocationsCheatElement.style.position = "fixed"; 
      findLocationsCheatElement.style.right = "20px";
      findLocationsCheatElement.style.cursor = 'pointer';
      findLocationsCheatElement.style.borderRadius = '5px';
      findLocationsCheatElement.addEventListener('click', getLocationsAndInitUI);
      findLocationsCheatElement.textContent = "Find Locations";

      document.body.appendChild(findLocationsCheatElement); 

      changeCopyrightText("Versus Cheats Activated");
      console.log("Activation complete. Click 'Find Locations'.");
    }

    // --- Start Execution ---
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        activateCheats();
    } else {
        document.addEventListener('DOMContentLoaded', activateCheats);
    }

})();
