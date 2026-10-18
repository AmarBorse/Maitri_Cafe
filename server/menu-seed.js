// Menu transcribed from the Maitri Cafe printed menu.
// Prices are in whole rupees. Items with a `variants` map become one row per variant.
module.exports = [
  { slug: 'burgers', name: 'Burgers', items: [
    ['Veg Burger', 60], ['Aloo Tikki Burger', 80], ['Aloo Tikki Cheese Burger', 90],
    ['Hot & Spicy Burger', 80], ['Paneer Tikki Burger', 100], ['Paneer Tikka Burger with Cheese', 110],
    ['Double Tikki Burger', 120], ['Maharaja Burger', 120],
  ]},
  { slug: 'pizza', name: 'Pizza', items: [
    ['Margherita Pizza', 90], ['Mexican Pizza', 120], ['Four Cheese Pizza', 110],
    ['Garlic Cheese Pizza', 100], ['Cheese Chilli Pizza', 110], ['Farm House Pizza', 140],
    ['Cheese Corn Pizza', 110], ['Paneer Tikka Pizza', 130],
  ]},
  { slug: 'momos', name: 'Momos', items: [
    ['Veg Momos', { Steam: 79, Fried: 100 }], ['Cheese Momos', { Steam: 89, Fried: 110 }],
    ['Paneer Momos', { Steam: 89, Fried: 110 }], ['Cheese Corn Momos', { Steam: 89, Fried: 110 }],
  ]},
  { slug: 'mocktail', name: 'Mocktail', items: [
    ['Blue Lagoon', 70], ['Mojito', 70], ['Kiwi Cooler', 70], ['Mango Colada', 70],
    ['Pina Colada', 70], ['Fruit Punch', 70], ['Fresh Lime Soda', 70],
  ]},
  { slug: 'milkshake', name: 'Milk Shake', items: [
    ['Vanilla Shake', 110], ['Strawberry Shake', 110], ['Oreo Shake', 110],
    ['Mango Shake', 110], ['Pineapple Shake', 110], ['Chocolate Shake', 110],
  ]},
  { slug: 'sandwich', name: 'Sandwich', items: [
    ['Veg Grilled Sandwich', 80], ['Veg Cheese Grilled Sandwich', 90], ['Club Sandwich', 70],
    ['Cheese Loaded Sandwich', 110], ['Paneer Grilled Sandwich', 120], ['Cheese Corn Grilled Sandwich', 100],
    ['Maitri Special Cheese Sandwich', 120], ['Chocolate Sandwich', 80],
  ]},
  { slug: 'fries', name: 'Fries', items: [
    ['French Fries', 70], ['Peri Peri Fries', 90], ['Masala Fries', 90], ['Peri Peri Cheese Fries', 120],
  ]},
  { slug: 'garlic-bread', name: 'Garlic Bread', items: [
    ['Cheese Garlic Bread', 100], ['Mexican Stuffed Garlic Bread', 110],
    ['Paneer Tikka Stuffed Garlic Bread', 120], ['Cheese Chilli Garlic Bread', 110],
  ]},
  { slug: 'cold-coffee', name: 'Cold Coffee', items: [
    ['Cold Coffee', 50], ['Chocolate Cold Coffee', 60], ['Cold Coffee with Crush', 70],
    ['Vanilla Cold Coffee', 70], ['Cold Coffee with Ice Cream', 90],
  ]},
  { slug: 'pasta', name: 'Pasta', items: [
    ['Masala Pasta', 100], ['Red Sauce Pasta', 110], ['White Sauce Pasta', 120],
    ['Pink Sauce Pasta', 120], ['Extra Cheese (add-on)', 30],
  ]},
  { slug: 'maggie', name: 'Maggie', items: [
    ['Plain Maggie', 50], ['Hot & Spicy Maggie', 60], ['Double Masala Maggie', 70], ['Cheese Maggie', 80],
  ]},
  { slug: 'chai', name: 'Chai', items: [
    ['Regular Chai', 10], ['Full Chai', 20], ['Bun Maska', 30], ['Butter Bread', 25],
    ['Hot Coffee', 30], ['Hot Chocolate', 50],
  ]},
];
