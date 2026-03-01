import React, { useState, useEffect, useRef } from 'react';
import { FiChevronDown } from 'react-icons/fi';

function SimpleAutocomplete({ 
  items = [], 
  value, 
  onChange, 
  onSelect, 
  displayField, 
  placeholder = "Start typing...",
  required = false 
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter items based on input
  useEffect(() => {
    if (value && value.length > 0) {
      const filtered = items.filter(item => {
        const fieldValue = item[displayField] || '';
        return fieldValue.toLowerCase().includes(value.toLowerCase());
      });
      // Remove duplicates based on displayField
      const unique = filtered.filter((item, index, self) =>
        index === self.findIndex((t) => t[displayField] === item[displayField])
      );
      setFilteredItems(unique);
    } else {
      setFilteredItems([]);
    }
  }, [value, items, displayField]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowDropdown(true);
    setSelectedIndex(-1);
  };

  const handleSelect = (item) => {
    onChange(item[displayField]);
    onSelect(item);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || filteredItems.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredItems.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredItems.length) {
          handleSelect(filteredItems[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  const highlightMatch = (text, query) => {
    if (!query || !text) return text;
    const parts = String(text).split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? 
        <strong key={index} style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>{part}</strong> : 
        part
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value && setShowDropdown(true)}
          placeholder={placeholder}
          required={required}
          style={{ 
            width: '100%',
            paddingRight: '32px'
          }}
        />
        <FiChevronDown 
          style={{ 
            position: 'absolute', 
            right: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: 'var(--text-muted)',
            pointerEvents: 'none'
          }} 
          size={16} 
        />
      </div>

      {showDropdown && filteredItems.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxHeight: '250px',
          overflowY: 'auto',
          zIndex: 1000,
          marginTop: '4px'
        }}>
          {filteredItems.map((item, index) => (
            <div
              key={index}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                backgroundColor: selectedIndex === index ? '#f3f4f6' : 'white',
                borderBottom: index < filteredItems.length - 1 ? '1px solid #f3f4f6' : 'none',
                transition: 'background-color 0.15s ease'
              }}
            >
              <div style={{ 
                fontWeight: 500, 
                color: '#1f2937',
                marginBottom: '2px'
              }}>
                {highlightMatch(item[displayField], value)}
              </div>
              {item.unit && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#6b7280'
                }}>
                  Unit: {item.unit}
                  {item.unit_cost && ` • Cost: ₱${item.unit_cost}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SimpleAutocomplete;
