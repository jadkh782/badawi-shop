/**
 * What the manual says, separate from how it looks.
 *
 * Written for whoever stands at the counter, not for whoever built the app: plain verbs,
 * no jargon, and every step is something you can actually do with a thumb.
 */
export const SHOP = 'Badawi Shop';

export const sections = [
  {
    id: 'start',
    title: 'Opening the app',
    blurb:
      'The app asks for a PIN every time it is opened. There is no email and no password to remember.',
    screens: [
      {
        img: '01-lock.png',
        title: 'Enter the PIN',
        steps: [
          'Tap the four digits. The PIN is <b>2307</b>.',
          'The shop opens as soon as the fourth digit is tapped. There is no OK button.',
          'If a digit is wrong, tap the backspace key at the bottom right.',
        ],
        note: 'The PIN can be changed, or switched off, in Settings. Change it from 2307 if the phone leaves the shop.',
      },
      {
        img: '02-home.png',
        title: 'The home screen',
        steps: [
          '<b>Sell</b> is for serving a customer.',
          '<b>Inventory</b> is for putting stock on the shelves.',
          'Underneath, today\u2019s takings and profit so far.',
          '<b>Reports and export</b> at the bottom for the figures.',
        ],
        note: 'The small amber dot at the top shows the exchange rate the app is using. Every pound figure in the app comes from it.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Serving a customer',
    blurb:
      'Scan what the customer is buying, apply a discount if you are giving one, and take the money. Stock comes off by itself.',
    screens: [
      {
        img: '03-sell-empty.png',
        title: 'Start a sale',
        steps: [
          'Tap <b>Sell</b> on the home screen.',
          'Tap <b>Scan</b> and point the camera at the barcode.',
          'The phone beeps and buzzes for each item. Keep scanning; the camera stays open.',
          'For anything with no barcode, tap the magnifying glass instead.',
        ],
        note: 'A plugged-in barcode scanner works anywhere on this screen with nothing to switch on.',
      },
      {
        img: '04-sell-browse.png',
        title: 'Items with no barcode',
        steps: [
          'Tap the magnifying glass at the bottom left.',
          'Pick a shelf along the top, or type a name in the search box.',
          'Tap the item to put it in the cart.',
        ],
        note: 'This is how bread, loose sugar and anything sold by weight goes through the till. Greyed-out items have none left.',
      },
      {
        img: '05-sell-cart.png',
        title: 'The cart',
        steps: [
          'The total is at the top, in dollars and in pounds.',
          'Use <b>\u2212</b> and <b>+</b> to change how many.',
          'Tap <b>\u00d7</b> on the right to take a line out.',
          'Scanning the same item again just adds one to it.',
        ],
        note: 'If a line turns amber, the shelf has fewer than the cart is asking for. The sale will be refused until it is corrected.',
      },
      {
        img: '06-checkout.png',
        title: 'Taking the money',
        steps: [
          'Tap <b>Check out</b>.',
          'Check the total. It is shown in both currencies.',
          'Tap <b>US dollars</b> or <b>Lebanese pounds</b> for whichever the customer is paying with.',
          'Tap the big amber button to record the sale.',
        ],
        note: 'Which currency was taken is recorded, so the end-of-day cash count can be checked against it.',
      },
      {
        img: '07-checkout-discount.png',
        title: 'Giving a discount',
        steps: [
          'Tap <b>Percent</b> for a percentage off, or <b>Amount</b> for a fixed sum off.',
          'Type the number. Both totals update as you type.',
          'Tap <b>None</b> to take the discount away again.',
        ],
        note: 'A discount can never take a sale below zero, however large a number is typed.',
      },
      {
        img: '08-sale-done.png',
        title: 'Change for the customer',
        steps: [
          'The sale is now recorded and stock has come off.',
          'Type what the customer handed over into <b>Cash given</b>.',
          'The change appears underneath, in the same currency.',
          'Tap <b>Next sale</b> for the following customer.',
        ],
        note: 'The reference under the total, such as #a1b2c3d4, is how a sale is found again in the exported spreadsheet.',
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Keeping the shelves right',
    blurb:
      'Everything the shop sells has to be in here once, with what it cost and what it sells for. That is where the profit figure comes from.',
    screens: [
      {
        img: '09-inventory.png',
        title: 'What is in stock',
        steps: [
          'Tap <b>Inventory</b> on the home screen.',
          'Search by name, or by typing the start of a barcode.',
          'Tap <b>Scan</b> to jump straight to an item by its barcode.',
          'The number on the right of each row is how many are left.',
        ],
        note: 'In Inventory a scan finds the item. In Sell the same scan puts it in the cart. That is the only difference between the two modes.',
      },
      {
        img: '10-inventory-low.png',
        title: 'What needs reordering',
        steps: [
          'Tap <b>Running low</b> along the top.',
          'Red means the shelf is empty. Amber means it is close.',
        ],
        note: 'Each article has its own alert level, so a slow-moving item is not flagged at the same count as a fast one.',
      },
      {
        img: '11-inventory-new.png',
        title: 'Adding an article',
        steps: [
          'Tap <b>New article</b>, then the scan button beside Barcode.',
          'Type the name as it reads on the label.',
          'Pick a shelf, then fill in <b>Cost price</b> and <b>Sale price</b>.',
          'Enter how many you have, then tap <b>Save article</b>.',
        ],
        note: 'The box between the prices shows what you make on each one. It turns red if the sale price is below the cost, which is almost always a typing slip.',
      },
      {
        img: '12-inventory-item.png',
        title: 'Changing an article',
        steps: [
          'Tap any item in the list.',
          'Change the price, the name, the shelf or the alert level.',
          'Tap <b>Save changes</b>.',
        ],
        note: 'The stock count cannot be typed over here. It moves through Restock, so every change leaves a record of what happened and why.',
      },
      {
        img: '13-restock.png',
        title: 'A delivery, or a miscount',
        steps: [
          'Tap <b>Restock</b> on the article.',
          '<b>Delivery</b> adds to what is already there. Use the +1, +6, +12 and +24 buttons.',
          '<b>Correction</b> sets the count to what is actually on the shelf.',
          'Check the new level, then save.',
        ],
        note: 'Use Correction after counting the shelf, and Delivery when goods arrive. Getting this the right way round keeps the count honest.',
      },
      {
        img: '14-categories.png',
        title: 'Shelves',
        steps: [
          'Tap <b>Categories</b> at the top of Inventory.',
          'Tap one to rename it or change its colour.',
          'Tap <b>New category</b> to add one.',
        ],
        note: 'Deleting a shelf never deletes what was on it. Those articles simply become uncategorised.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'The figures',
    blurb:
      'What sold, what it earned, and what needs reordering \u2014 for any stretch of days you choose.',
    screens: [
      {
        img: '15-reports.png',
        title: 'Choosing a period',
        steps: [
          'Tap <b>Today</b>, <b>Yesterday</b>, <b>This week</b> or <b>This month</b>.',
          'Tap <b>Custom</b> to pick any two dates.',
          '<b>Day</b>, <b>Week</b> and <b>Month</b> change how the bars are grouped.',
          'Tap any bar to read that day on its own.',
        ],
        note: 'Green is the profit; amber is what the goods cost. The two together are the takings.',
      },
      {
        img: '16-reports-figures.png',
        title: 'Reading the figures',
        steps: [
          '<b>Total sales</b> is what came in, after discounts.',
          '<b>Profit</b> is what is left after what the goods cost.',
          '<b>Average basket</b> is the takings divided by the number of sales.',
          '<b>Taken in USD</b> and <b>Taken in LBP</b> is what to count in the drawer.',
        ],
        note: 'Every figure covers the period chosen at the top of the screen, and nothing else.',
      },
      {
        img: '17-reports-sellers.png',
        title: 'Best sellers and the export',
        steps: [
          'Switch between <b>by quantity</b> and <b>by profit</b>. They are rarely the same list.',
          '<b>Needs restocking</b> at the bottom is the shopping list.',
          'Tap <b>Export to Excel</b> for the whole period as a spreadsheet.',
        ],
        note: 'On the phone the file is saved into Documents and the sharing menu opens, so it can go straight to WhatsApp, Drive or email.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    blurb: 'The exchange rate and the screen lock.',
    screens: [
      {
        img: '18-settings.png',
        title: 'The exchange rate',
        steps: [
          'Type the number of pounds to one dollar.',
          'Choose what to round pound totals to, so there is no hunting for small change.',
          'Check the example underneath, then tap <b>Save rate</b>.',
        ],
        note: 'Changing the rate changes every pound figure in the app at once. Sales already taken keep the rate they were taken at, so old receipts stay correct.',
      },
      {
        img: '19-settings-lock.png',
        title: 'The screen lock',
        steps: [
          '<b>Choose your own</b> replaces 2307 with a PIN of your own.',
          '<b>Reset</b> puts 2307 back.',
          '<b>Lock now</b> locks the screen straight away.',
          '<b>Turn off</b> stops it asking at all.',
        ],
        note: 'The PIN stops someone who picks up the phone reading your takings. It is not a lock on the data itself.',
      },
    ],
  },
  {
    id: 'desktop',
    title: 'On a computer',
    blurb: 'The same app, the same figures, laid out for a bigger screen.',
    screens: [
      {
        img: '20-desktop.png',
        title: 'The wide layout',
        steps: [
          'Sell, Inventory and Reports sit in a rail down the left.',
          'The figures spread into columns instead of one long scroll.',
          'A plugged-in barcode scanner works here exactly as it does on the phone.',
        ],
        note: 'It is the same shop and the same database. Anything done on the computer shows on the phone, and the other way round.',
      },
    ],
  },
];
